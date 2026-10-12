# PulseCheck - DevOps Server Status Dashboard

PulseCheck is a responsive web dashboard that simulates server health and infrastructure metrics in a clean, modern interface.

## Features

- **Infrastructure metrics:** CPU, memory, disk usage, and uptime.
- **Service health monitoring:** Status indicators for API Server, Database, Authentication Service, and Background Workers.
- **Live simulated metrics:** Periodically updating sample data.
- **Usage visualization:** A lightweight chart built without external charting dependencies.
- **Incident simulation:** Trigger a simulated service incident and recover the service.
- **Activity log:** Displays recent simulated infrastructure events.
- **Responsive design:** Works across desktop and smaller screens.

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript

## Getting Started

1. Clone or download this repository.
2. Open `index.html` in a modern web browser.
3. Explore the dashboard and test the incident and recovery controls.

No backend, package installation, API keys, or build tools are required.

## Project Structure

```text
pulsecheck-dashboard/
├── index.html
├── style.css
├── script.js
├── README.md
└── LICENSE
```

## Data Disclaimer

All metrics, uptime values, service statuses, and activity events are simulated for demonstration purposes. This project does not monitor real infrastructure.

## Future Improvements

- Connect to a real monitoring API.
- Add historical metrics and alert thresholds.
- Support configurable monitoring intervals.

## License

Distributed under the MIT License. See `LICENSE` for details.
