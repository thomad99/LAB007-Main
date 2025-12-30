# LAB007 Unified Services

This is a unified web service that combines all LAB007 projects into a single application hosted on Render.

## Projects Included

1. **3D Print** - Online 3D printing quote system
2. **Citrix-Horizon** - Citrix audit dashboard
3. **VINValue** - Vehicle valuation service
4. **Web-Alert** - Website change monitoring and alerts

## Project Structure

```
.
├── server.js              # Main unified server
├── package.json           # Unified dependencies
├── public/                # Main landing page
│   └── index.html
├── ENV_VARIABLES.md       # Complete list of environment variables
├── 3dPrint/               # 3D Print project
├── Citrix-Horizon/        # Citrix project
├── VINValue/              # VIN Value project
├── Web-Alert/             # Web Alert project
└── LAB007/                # Shared images
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (see ENV_VARIABLES.md)

3. Start the server:
```bash
npm start
```

## Access Points

- Main Landing Page: `http://localhost:3000/`
- 3D Print: `http://localhost:3000/3dprint`
- Citrix: `http://localhost:3000/citrix`
- VIN Value: `http://localhost:3000/vinvalue`
- Web Alert: `http://localhost:3000/webalert`

## Environment Variables

See [ENV_VARIABLES.md](ENV_VARIABLES.md) for a complete list of all required environment variables.

## Deployment on Render

1. Connect your GitHub repository
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Add all environment variables from ENV_VARIABLES.md
5. Deploy!

## Notes

- Each project maintains its own functionality and routes
- Static files are served from each project's public directory
- API routes are namespaced under each project's path
- The main landing page provides links to all projects

