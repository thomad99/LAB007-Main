LAB007 Discovery Tools - Citrix Environment Audit
====================================================

HOW TO START THE AUDIT
=======================

Run the audit script:
    .\Scripts\Collect-CitrixAuditData.ps1

This will prompt you for:
    - Citrix Version (e.g., 1912, 2009, 2203)
    - Delivery Controller (DDC) Name

Or specify parameters directly:
    .\Scripts\Collect-CitrixAuditData.ps1 -CitrixVersion "1912" -DDCName "ddc01.domain.com" -NonInteractive


BEFORE RUNNING
==============

1. Load Citrix modules/snap-ins (or the script will try to install dependencies automatically)
2. Run PowerShell as Administrator (recommended for best results)


WHAT HAPPENS
============

The audit will:
    - Check for and install missing dependencies (VMware PowerCLI, etc.)
    - Collect Citrix environment data
    - Save results to: .\Data\citrix-audit-complete.json
    - You can then view the dashboard to see the results


VIEWING THE DASHBOARD
=====================

After the audit completes:
    1. Navigate to the Web folder
    2. Double-click index.html
    3. Click "Load Audit Data" button
    4. Select: Data\citrix-audit-complete.json

Or use Node.js web server (if configured):
    npm start
    Then open: http://localhost:3000


SUPPORTED CITRIX VERSIONS
=========================
- 1912, 7.15, 7.6, 7.0 (uses PowerShell snap-ins)
- 2009, 2012, 2112, 2203, 2209, 2305, 2311 (uses PowerShell modules)


For more detailed information, see README.md

