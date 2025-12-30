# Dependencies Folder

This folder is used to store bundled installer files for Citrix and VMware components.

## Structure

```
Dependencies/
├── Citrix/
│   └── (Place Citrix PowerShell SDK MSI installer files here)
├── VMware/
│   └── (Place VMware PowerCLI files here - ZIP, MSI, or module directory)
└── README.md
```

## Citrix PowerShell SDK

To bundle Citrix installers:

1. Obtain the Citrix Virtual Apps and Desktops PowerShell SDK installer files

2. Copy the MSI installer files to:
   `.\Dependencies\Citrix\`

3. The installation script (`Install-RequiredModules.ps1`) will automatically detect and install these files.

## VMware PowerCLI

To bundle VMware PowerCLI:

1. Obtain VMware PowerCLI files (ZIP archive, MSI installer, or extracted module directory)

2. Place the files in:
   `.\Dependencies\VMware\`

3. Supported formats:
   - **ZIP files**: Will be extracted to `Documents\WindowsPowerShell\Modules\`
   - **MSI installers**: Will be installed via msiexec.exe
   - **Module directories**: Will be copied to `Documents\WindowsPowerShell\Modules\`

4. The installation script (`Install-RequiredModules.ps1`) will automatically detect and install these files.

## Notes

- MSI installers typically require Administrator privileges
- The installation script will automatically install files when found (no internet connection required)
- Use the `-Force` parameter to reinstall even if modules are already present

