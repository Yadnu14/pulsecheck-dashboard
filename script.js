(() => {
  const SAMPLE_INTERVAL_MS = 2500;
  const HISTORY_LENGTH = 20;

  const services = {
    api: {
      name: "API Server",
      healthy: { label: "Healthy", meta: "Listening on :443", className: "healthy" },
      incident: { label: "Degraded", meta: "Elevated 5xx on /v1/status", className: "degraded" },
    },
    db: {
      name: "Database",
      healthy: { label: "Healthy", meta: "Primary replica in sync", className: "healthy" },
      incident: { label: "Unreachable", meta: "Connection pool exhausted", className: "down" },
    },
    auth: {
      name: "Authentication Service",
      healthy: { label: "Healthy", meta: "Token issuance normal", className: "healthy" },
      incident: { label: "Degraded", meta: "Latency 840ms on /oauth/token", className: "degraded" },
    },
    workers: {
      name: "Background Workers",
      healthy: { label: "Healthy", meta: "4 of 4 consumers online", className: "healthy" },
      incident: { label: "Offline", meta: "Queue depth 1,284 · 0 consumers", className: "down" },
    },
  };

  const state = {
    paused: false,
    incident: false,
    bootTime: Date.now() - (14 * 24 + 7) * 60 * 60 * 1000 - 42 * 60 * 1000,
    cpu: 34,
    memory: 58,
    disk: 41,
    history: [],
    timer: null,
  };

  const els = {
    clock: document.getElementById("clock"),
    lastUpdated: document.getElementById("last-updated"),
    live: document.getElementById("live-region"),
    pause: document.getElementById("btn-pause"),
    refresh: document.getElementById("btn-refresh"),
    incident: document.getElementById("btn-incident"),
    recover: document.getElementById("btn-recover"),
    clearLog: document.getElementById("btn-clear-log"),
    log: document.getElementById("activity-log"),
    clusterChip: document.getElementById("cluster-chip"),
    chart: document.getElementById("usage-chart"),
    chartBody: document.getElementById("chart-table-body"),
    cpuValue: document.getElementById("cpu-value"),
    cpuMeter: document.getElementById("cpu-meter"),
    cpuChip: document.getElementById("cpu-chip"),
    cpuSub: document.getElementById("cpu-sub"),
    memValue: document.getElementById("mem-value"),
    memMeter: document.getElementById("mem-meter"),
    memChip: document.getElementById("mem-chip"),
    memSub: document.getElementById("mem-sub"),
    diskValue: document.getElementById("disk-value"),
    diskMeter: document.getElementById("disk-meter"),
    diskChip: document.getElementById("disk-chip"),
    diskSub: document.getElementById("disk-sub"),
    uptimeValue: document.getElementById("uptime-value"),
    uptimeSub: document.getElementById("uptime-sub"),
  };

  const ctx = els.chart.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function jitter(value, amount, min, max) {
    return clamp(value + (Math.random() * 2 - 1) * amount, min, max);
  }

  function formatPct(n) {
    return `${n.toFixed(1)}%`;
  }

  function formatUptime(ms) {
    const total = Math.floor(ms / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }

  function formatClock(date) {
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function announce(message) {
    els.live.textContent = "";
    requestAnimationFrame(() => {
      els.live.textContent = message;
    });
  }

  function setChip(el, text, kind) {
    el.textContent = text;
    el.classList.remove("ok", "warn", "bad");
    if (kind) el.classList.add(kind);
  }

  function thresholdKind(value) {
    if (value >= 90) return "bad";
    if (value >= 75) return "warn";
    return "ok";
  }

  function thresholdLabel(value) {
    if (value >= 90) return "Critical";
    if (value >= 75) return "Elevated";
    return "Nominal";
  }

  function applyService(id, incident) {
    const conf = services[id];
    const view = incident ? conf.incident : conf.healthy;
    const item = document.querySelector(`[data-service="${id}"]`);
    item.classList.remove("healthy", "degraded", "down");
    item.classList.add(view.className);
    document.getElementById(`${id}-state`).textContent = view.label;
    document.getElementById(`${id}-meta`).textContent = view.meta;
  }

  function renderServices() {
    Object.keys(services).forEach((id) => applyService(id, state.incident));
    if (state.incident) {
      setChip(els.clusterChip, "Incident in progress", "bad");
    } else {
      setChip(els.clusterChip, "All systems operational", "ok");
    }
  }

  function addLog({ level, title, detail, at = new Date() }) {
    const li = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = at.toISOString();
    time.textContent = at.toLocaleTimeString(undefined, { hour12: false });

    const mark = document.createElement("span");
    mark.className = `log-mark ${level}`;
    mark.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    const p = document.createElement("p");
    p.textContent = title;
    const d = document.createElement("p");
    d.className = "log-detail";
    d.textContent = detail;
    body.append(p, d);

    li.append(time, mark, body);
    els.log.prepend(li);

    while (els.log.children.length > 40) {
      els.log.lastElementChild.remove();
    }
  }

  function seedLog() {
    const now = Date.now();
    const samples = [
      { offset: 18 * 60 * 1000, level: "info", title: "Deploy completed: pulsecheck-api@1.8.4", detail: "Rolling restart finished on 3 replicas." },
      { offset: 14 * 60 * 1000, level: "ok", title: "TLS certificate renewed", detail: "api.pulsecheck.local valid for 89 days." },
      { offset: 9 * 60 * 1000, level: "info", title: "Autoscaler held replica count", detail: "CPU 15-minute average stayed below 55%." },
      { offset: 6 * 60 * 1000, level: "warn", title: "Slow query flagged on payments.ledger", detail: "p95 412ms · index recommendation queued." },
      { offset: 3 * 60 * 1000, level: "ok", title: "Backup snapshot stored", detail: "Nightly dump uploaded to object storage." },
      { offset: 45 * 1000, level: "info", title: "Heartbeat received from worker pool", detail: "jobs-consumer-03 reported ready." },
    ];
    samples.forEach((item) => {
      addLog({
        level: item.level,
        title: item.title,
        detail: item.detail,
        at: new Date(now - item.offset),
      });
    });
  }

  function sampleMetrics() {
    if (state.incident) {
      state.cpu = jitter(Math.max(state.cpu, 88), 4, 82, 99);
      state.memory = jitter(Math.max(state.memory, 81), 3, 76, 96);
      state.disk = jitter(state.disk, 0.4, 40, 72);
    } else {
      state.cpu = jitter(state.cpu, 4.5, 18, 72);
      state.memory = jitter(state.memory, 2.2, 42, 78);
      state.disk = jitter(state.disk, 0.35, 36, 58);
    }

    const point = {
      cpu: Number(state.cpu.toFixed(1)),
      memory: Number(state.memory.toFixed(1)),
      disk: Number(state.disk.toFixed(1)),
      at: new Date(),
    };
    state.history.push(point);
    if (state.history.length > HISTORY_LENGTH) state.history.shift();
    return point;
  }

  function renderMetrics() {
    const latest = state.history[state.history.length - 1];
    if (!latest) return;

    els.cpuValue.textContent = formatPct(latest.cpu);
    els.cpuMeter.style.width = `${latest.cpu}%`;
    setChip(els.cpuChip, thresholdLabel(latest.cpu), thresholdKind(latest.cpu));
    els.cpuSub.textContent = `8 vCPU · simulated load ${((latest.cpu / 100) * 8).toFixed(2)}`;

    els.memValue.textContent = formatPct(latest.memory);
    els.memMeter.style.width = `${latest.memory}%`;
    setChip(els.memChip, thresholdLabel(latest.memory), thresholdKind(latest.memory));
    els.memSub.textContent = `${((latest.memory / 100) * 32).toFixed(1)} GB of 32 GB in use`;

    els.diskValue.textContent = formatPct(latest.disk);
    els.diskMeter.style.width = `${latest.disk}%`;
    setChip(els.diskChip, thresholdLabel(latest.disk), thresholdKind(latest.disk));
    els.diskSub.textContent = `${((latest.disk / 100) * 480).toFixed(0)} GB of 480 GB used`;

    const upMs = Date.now() - state.bootTime;
    els.uptimeValue.textContent = formatUptime(upMs);
    els.uptimeSub.textContent = `Simulated boot ${new Date(state.bootTime).toLocaleString()}`;

    const stamp = latest.at;
    els.lastUpdated.textContent = stamp.toLocaleTimeString();
    els.lastUpdated.dateTime = stamp.toISOString();
    els.clock.textContent = formatClock(new Date());

    els.chartBody.innerHTML = "";
    state.history.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<th scope="row">${i + 1}</th><td>${row.cpu}</td><td>${row.memory}</td><td>${row.disk}</td>`;
      els.chartBody.append(tr);
    });
  }

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = els.chart.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = 260;
    els.chart.width = Math.round(width * dpr);
    els.chart.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    els.chart.style.width = `${width}px`;
    els.chart.style.height = `${height}px`;
    drawChart();
  }

  function seriesPath(values, width, height, pad) {
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const step = values.length > 1 ? innerW / (values.length - 1) : innerW;
    const path = [];
    values.forEach((v, i) => {
      const x = pad.l + i * step;
      const y = pad.t + innerH - (v / 100) * innerH;
      path.push([x, y]);
    });
    return path;
  }

  function strokeSeries(points, color) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(last[0], last[1], 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawChart() {
    const width = els.chart.getBoundingClientRect().width;
    const height = 260;
    const pad = { t: 16, r: 12, b: 28, l: 36 };

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(7, 11, 18, 0.35)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(148, 178, 214, 0.14)";
    ctx.lineWidth = 1;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.fillStyle = "#93a4bb";

    for (let i = 0; i <= 4; i += 1) {
      const y = pad.t + ((height - pad.t - pad.b) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(width - pad.r, y);
      ctx.stroke();
      ctx.fillText(`${100 - i * 25}`, 8, y + 4);
    }

    if (!state.history.length) return;

    const cpu = seriesPath(state.history.map((p) => p.cpu), width, height, pad);
    const mem = seriesPath(state.history.map((p) => p.memory), width, height, pad);
    const disk = seriesPath(state.history.map((p) => p.disk), width, height, pad);

    strokeSeries(cpu, "#7aa2ff");
    strokeSeries(mem, "#4fd1c5");
    strokeSeries(disk, "#c084fc");

    ctx.fillStyle = "#93a4bb";
    ctx.fillText("oldest", pad.l, height - 8);
    ctx.fillText("newest", width - pad.r - 42, height - 8);
  }

  function tick(fromUser) {
    sampleMetrics();
    renderMetrics();
    drawChart();
    if (fromUser) {
      addLog({
        level: "info",
        title: "Manual refresh requested",
        detail: "Operator pulled a new simulated sample.",
      });
    }
  }

  function startTimer() {
    stopTimer();
    state.timer = setInterval(() => {
      if (!state.paused) tick(false);
      else {
        els.clock.textContent = formatClock(new Date());
        const upMs = Date.now() - state.bootTime;
        els.uptimeValue.textContent = formatUptime(upMs);
      }
    }, SAMPLE_INTERVAL_MS);
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function simulateIncident() {
    if (state.incident) return;
    state.incident = true;
    renderServices();
    els.incident.disabled = true;
    els.recover.disabled = false;
    addLog({
      level: "error",
      title: "Simulated incident: database primary unreachable",
      detail: "API 5xx rising · auth latency degraded · worker consumers dropped.",
    });
    announce("Simulated incident started. Database is unreachable and dependent services are degraded.");
    tick(false);
  }

  function recover() {
    if (!state.incident) return;
    state.incident = false;
    renderServices();
    els.incident.disabled = false;
    els.recover.disabled = true;
    addLog({
      level: "ok",
      title: "Recovery complete",
      detail: "Failover succeeded. All four services report healthy.",
    });
    announce("Services recovered. Cluster reports all systems operational.");
    tick(false);
  }

  function togglePause() {
    state.paused = !state.paused;
    els.pause.setAttribute("aria-pressed", String(state.paused));
    els.pause.textContent = state.paused ? "Resume updates" : "Pause updates";
    addLog({
      level: "info",
      title: state.paused ? "Live sampling paused" : "Live sampling resumed",
      detail: "Telemetry on this page remains simulated.",
    });
    announce(state.paused ? "Metric updates paused." : "Metric updates resumed.");
  }

  function clearLog() {
    els.log.replaceChildren();
    addLog({
      level: "info",
      title: "Activity log cleared",
      detail: "New simulated events will appear here.",
    });
  }

  els.pause.addEventListener("click", togglePause);
  els.refresh.addEventListener("click", () => tick(true));
  els.incident.addEventListener("click", simulateIncident);
  els.recover.addEventListener("click", recover);
  els.clearLog.addEventListener("click", clearLog);
  window.addEventListener("resize", () => {
    if (reduceMotion) sizeCanvas();
    else requestAnimationFrame(sizeCanvas);
  });

  seedLog();
  renderServices();
  for (let i = 0; i < HISTORY_LENGTH; i += 1) sampleMetrics();
  renderMetrics();
  sizeCanvas();
  startTimer();
  addLog({
    level: "info",
    title: "PulseCheck dashboard online",
    detail: "Streaming simulated CPU, memory, disk, and service health.",
  });
})();
