// todo.js
// Simple Horizon design to-do checklist with localStorage persistence

const TODO_STORAGE_KEY = 'lab007_horizon_todo_v1';

// Static task definitions (IDs must be stable!)
const TODO_ITEMS = [
  {
    id: 'data-center-design',
    title: 'Data Center Design',
    details:
      'Horizon supports multi-datacenter (POD) layout for load balancing and HA across data centers. ' +
      'Each datacenter is a POD. Validate POD layout, inter-site connectivity, and failover design.'
  },
  {
    id: 'controllers',
    title: 'Controllers',
    details:
      'Connection servers handle management (like DDCs) & brokering (like StoreFront). ' +
      'There is no database component, each Controller keeps a local copy of the config that it replicates with other controllers in the POD. ' +
      'You need at least 2 connection servers; each can handle ~2000 concurrent users.'
  },
  {
    id: 'load-balancing',
    title: 'Load Balancing (Controllers)',
    details:
      'Users should access Horizon via a load-balanced address (e.g. horizon.yourorg.com). ' +
      'Any load balancer can be used. Certificates are required for the LB address and must be deployed on all connection servers/controllers.'
  },
  {
    id: 'uag-external-access',
    title: 'UAG (External Access)',
    details:
      'For external access, deploy Horizon UAG appliances in the DMZ behind a load balancer (at least 2). ' +
      'Public certificates are required. UAG supports SAML, MFA and RADIUS authentication.'
  },
  {
    id: 'load-balancing-uag',
    title: 'Load Balancing (UAG)',
    details:
      'Design load balancing specifically for UAG appliances (DMZ). ' +
      'Define the external VIP (e.g. horizon-ext.yourorg.com), health checks, persistence method, and SSL offload/termination model. ' +
      'Ensure public certificates are installed consistently across all UAGs and the load balancer.'
  },
  {
    id: 'horizon-agent',
    title: 'Horizon Agent',
    details:
      'The Horizon Agent is installed on RDS hosts and desktop OS machines (replaces the Citrix VDA). ' +
      'During installation select appropriate components (USB, scanners, etc.) based on requirements.'
  },
  {
    id: 'horizon-client',
    title: 'Horizon Client',
    details:
      'Users can connect via HTML5 or the Horizon Client (similar to Citrix Workspace app). ' +
      'The client controls favourites, screen layouts, printers, client drive mappings and allows session control.'
  },
  {
    id: 'base-images',
    title: 'Base Images',
    details:
      'Horizon clones golden master images into pools of machines. The Horizon Agent must be installed in the master image. ' +
      'Horizon performs machine preparation when building pools, so confirm image prep steps and customisations.'
  },
  {
    id: 'citrix-catalogs',
    title: 'Citrix Catalogs',
    details:
      'Citrix Machine Catalogs map conceptually to Horizon Farms. A Farm is a collection of machines built from the same base image. ' +
      'A single Farm can only be deployed into one Horizon pod/cluster; if you have multiple clusters you must build multiple Farms from the same image. ' +
      'Resources can then be load-balanced across these similar Farms in a way that is conceptually similar to how MCS deployments are balanced across catalogs.'
  },
  {
    id: 'desktop-types',
    title: 'Desktop Types',
    details:
      'Horizon supports multiple desktop types (pooled, persistent, non-persistent) for both server and desktop OS, ' +
      'similar to Citrix. Decide on use cases per desktop type.'
  },
  {
    id: 'profiles',
    title: 'Profiles',
    details:
      'FSLogix is the recommended profile solution. Install the agent in the image and configure a GPO for profile path. ' +
      'Expect 2–5 GB per user unless tuned, so profile storage sizing and exclusions are important. ' +
      'Horizon DEM also offer a basic profile solution. It uses a central file repository to store user profiles.'
  },
  {
    id: 'citrix-upm',
    title: 'Citrix UPM',
    details:
      'Citrix User Profile Management (UPM) is not supported for Horizon deployments and should not be used as the profile solution. ' +
      'Refer to the Profiles section (e.g. FSLogix, DEM, folder redirection) to choose appropriate profile options for Horizon.'
  },
  {
    id: 'redirection',
    title: 'Redirection',
    details:
      'If folder redirections are already in place, the recommendation is generally to keep them unless there is a strong reason to change.'
  },
  {
    id: 'ou-design',
    title: 'OU Design',
    details:
      'Decide whether Horizon machines will be created in existing Citrix OUs (to reuse GPOs) or in new OUs. ' +
      'If new OUs are used, ensure required GPOs are linked appropriately.'
  },
  {
    id: 'group-policy',
    title: 'Group Policy',
    details:
      'If existing GPOs manage user experience and app configuration, ensure they are applied consistently for Horizon servers. ' +
      'Review Horizon-specific policy settings as well.'
  },
  {
    id: 'citrix-policies',
    title: 'Citrix Policies',
    details:
      'Existing Citrix policies will need to be mapped to equivalent settings that can be deployed via Group Policy (GPO) or VMware DEM (Dynamic Environment Manager, similar to Citrix WEM). ' +
      'DEM offers more advanced, condition-based filtering than traditional GPOs. Identify which Citrix policy settings should become GPOs, which should move to DEM, and document any gaps or behavioural differences.'
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    details:
      'The Horizon management console can be used as a support and monitoring tool similar to Citrix Director. ' +
      'Third-party tools can still be used on endpoints, and ControlUp has full support for monitoring via its agent. ' +
      'Decide which monitoring platform(s) will be standard, how alerts are handled, and what dashboards/support workflows are required.'
  },
  {
    id: 'licences',
    title: 'Licences',
    details:
      'Discuss Horizon licensing options with your vendor/rep (e.g. subscription vs. perpetual, user/device vs. concurrent, ' +
      'DR/secondary site entitlements). Confirm which features are included in the chosen edition and ensure sizing aligns with ' +
      'expected user counts and growth.'
  },
  {
    id: 'citrix-wem-dem',
    title: 'Citrix WEM vs DEM',
    details:
      'Horizon uses Dynamic Environment Manager (DEM) as an environment manager similar to Citrix WEM. DEM can manage shortcuts, drive mappings, printers, ' +
      'and many other user environment settings, with granular condition-based targeting. Identify which existing WEM configurations should be migrated into DEM ' +
      'and plan how to validate behaviour parity for key use cases.'
  },
  {
    id: 'third-party-env-tools',
    title: 'Appsense / RES / Ivanti',
    details:
      'Third-party environment management tools such as AppSense, RES, and Ivanti are supported on Horizon. If these are already in use, confirm supportability ' +
      'on the target OS versions and ensure the appropriate agents are installed in the Horizon images. Decide whether to continue with these tools, move to DEM, ' +
      'or use a hybrid approach during transition.'
  },
  {
    id: 'citrix-app-layering',
    title: 'Citrix App Layering',
    details:
      'Horizon does not have a similar product to Citrix App Layering. Applications should be installed directly in the master/golden images. ' +
      'VMware ThinApp can be considered to package applications from older operating systems for deployment onto newer OS versions, which may help with compatibility ' +
      'and reduce the number of base images needed.'
  },
  {
    id: 'citrix-mcs',
    title: 'Citrix MCS',
    details:
      'Horizon Farms work in a similar way to Citrix MCS (Machine Creation Services). Farms allow the creation of many machines from a single master/golden image. ' +
      'During Farm creation, you can specify the resource pool (vSphere cluster/datastore), naming standards, OU location in Active Directory, and other provisioning settings. ' +
      'This provides similar automation and scalability benefits as MCS for deploying and managing VDI/RDSH machines.'
  },
  {
    id: 'citrix-pvs',
    title: 'Citrix PVS',
    details:
      'There is no similar product to Citrix PVS (Provisioning Services) in Horizon. The Horizon solution works more like Citrix MCS with linked cloning technology. ' +
      'Please see the "Citrix MCS" section for details on how Horizon Farms provide similar functionality for creating machines from master images.'
  },
  {
    id: 'logging',
    title: 'Logging',
    details:
      'Events and actions are logged by the Horizon Connection Server (controller) to an external logging resource. A syslog server is recommended for centralised logging. ' +
      'The Horizon Management Console is used to search through events and has filters to help find information. These logs are useful for tracking management actions ' +
      'and troubleshooting user issues. Plan the logging infrastructure and ensure proper log retention policies are in place.'
  },
  {
    id: 'consoles',
    title: 'Consoles',
    details:
      'Citrix uses the Studio console for management. Horizon uses a web-based management console that is available on all controller (Connection Server) servers. ' +
      'The controllers run the Tomcat web service to handle management, so management can be performed from any web browser by pointing at a controller or its load balanced address. ' +
      'DEM (Dynamic Environment Manager) has a client app console that needs to be installed on any machine that wants to manage DEM. It is recommended to install the DEM console ' +
      'on all controllers. DEM uses a central config file, so management can be performed from any installation of the DEM console application.'
  },
  {
    id: 'roles',
    title: 'Roles',
    details:
      'Just like Citrix management has the concept of roles and scopes to control management access, Horizon also uses roles and scopes for administrative permissions. ' +
      'The audit tool should help identify and document existing Citrix roles and scopes to facilitate conversion to Horizon equivalent roles and scopes during migration planning.'
  },
  {
    id: 'peripherals',
    title: 'Peripherals',
    details:
      'The Horizon agent and Workspace app support peripherals and have management controls over these devices. Items like USB devices, scanners, printers, microphones, and storage can all be controlled. ' +
      'Peripherals are often a tricky part of migrations, so all devices should be identified and UAT (User Acceptance Testing) tested to ensure proper functionality and control in the Horizon environment.'
  },
  {
    id: 'thinapp',
    title: 'ThinApp',
    details:
      'VMware ThinApp virtualises applications, allowing you to capture an app on an older operating system and deliver it on a newer OS without installing it natively. ' +
      'ThinApp packages can be delivered as standalone executables or wrapped as MSI files for deployment via existing software distribution tools.'
  },
  {
    id: 'firewall-rules',
    title: 'Firewall Rules',
    details:
      'Citrix uses ports 2598 and 1494 for HDX/ICA traffic, and 443 for web traffic. Horizon primarily uses 443 for the Blast display protocol and 4172 for PCoIP. ' +
      'Blast is the recommended display protocol. Connection Server to VM traffic requires 22443 TCP/UDP (Blast) and 4172 TCP/UDP (PCoIP). ' +
      'Horizon UAGs use ports 443 and 8443 to tunnel traffic when Blast Secure Gateway is enabled. ' +
      'Connection Server to Active Directory typically requires: 389 (LDAP), 636 (LDAPS), 88 (Kerberos), 445 (SMB for GPO), and 53 (DNS). ' +
      'Review and document all required inbound/outbound firewall rules between clients, UAGs, connection servers, and VDAs/RDS hosts.'
  }
];

function loadTodoState() {
  try {
    const raw = localStorage.getItem(TODO_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveTodoState(state) {
  try {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Swallow storage errors (e.g. disabled storage)
    console.warn('Unable to persist todo state to localStorage');
  }
}

function createTodoRow(item, savedState) {
  const state = savedState[item.id] || { completed: false, na: false, notes: '' };

  const tr = document.createElement('tr');
  tr.className = 'todo-main-row';

  const titleTd = document.createElement('td');
  titleTd.textContent = item.title;

  const completedTd = document.createElement('td');
  completedTd.style.textAlign = 'center';
  const completedCheckbox = document.createElement('input');
  completedCheckbox.type = 'checkbox';
  completedCheckbox.checked = !!state.completed;
  completedTd.appendChild(completedCheckbox);

  const naTd = document.createElement('td');
  naTd.style.textAlign = 'center';
  const naCheckbox = document.createElement('input');
  naCheckbox.type = 'checkbox';
  naCheckbox.checked = !!state.na;
  naTd.appendChild(naCheckbox);

  const notesTd = document.createElement('td');
  const textarea = document.createElement('textarea');
  textarea.value = state.notes || '';
  textarea.rows = 2;
  textarea.style.width = '100%';
  textarea.style.resize = 'vertical';
  notesTd.appendChild(textarea);

  const detailsTd = document.createElement('td');
  detailsTd.style.textAlign = 'center';
  const detailsButton = document.createElement('button');
  detailsButton.className = 'btn btn-secondary';
  detailsButton.type = 'button';
  detailsButton.textContent = 'Show Details';
  detailsTd.appendChild(detailsButton);

  tr.appendChild(titleTd);
  tr.appendChild(naTd);
  tr.appendChild(notesTd);
  tr.appendChild(completedTd);
  tr.appendChild(detailsTd);

  // Details row
  const detailsRow = document.createElement('tr');
  detailsRow.className = 'todo-details-row';
  detailsRow.style.display = 'none';
  const detailsCell = document.createElement('td');
  detailsCell.colSpan = 5;
  
  // Special handling for Horizon Client - add command line builder tool
  if (item.id === 'horizon-client') {
    detailsCell.innerHTML =
      '<div class="todo-details-box">' +
      `<p>${item.details}</p>` +
      '<div id="horizon-command-builder" style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">' +
      '<h3 style="margin-top: 0; color: #2d3561; font-size: 1.2rem; margin-bottom: 15px;">Horizon Client Command Line Builder</h3>' +
      '<div id="horizon-builder-form"></div>' +
      '<div id="horizon-command-output" style="margin-top: 20px; padding: 15px; background: white; border-radius: 5px; border: 2px solid #d4af37; display: none;">' +
      '<h4 style="margin-top: 0; color: #2d3561; font-size: 1rem; margin-bottom: 10px;">Generated Command Line:</h4>' +
      '<pre id="horizon-command-text" style="background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.9rem; margin: 0; word-break: break-all; white-space: pre-wrap;"></pre>' +
      '<button id="horizon-copy-btn" class="btn btn-primary" style="margin-top: 10px;">Copy Command</button>' +
      '</div>' +
      '</div>';
  } else if (item.id === 'horizon-agent') {
    detailsCell.innerHTML =
      '<div class="todo-details-box">' +
      `<p>${item.details}</p>` +
      '<div id="horizon-agent-command-builder" style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">' +
      '<h3 style="margin-top: 0; color: #2d3561; font-size: 1.2rem; margin-bottom: 15px;">Horizon Agent Command Line Builder</h3>' +
      '<div id="horizon-agent-builder-form"></div>' +
      '<div id="horizon-agent-command-output" style="margin-top: 20px; padding: 15px; background: white; border-radius: 5px; border: 2px solid #d4af37; display: none;">' +
      '<h4 style="margin-top: 0; color: #2d3561; font-size: 1rem; margin-bottom: 10px;">Generated Command Line:</h4>' +
      '<pre id="horizon-agent-command-text" style="background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.9rem; margin: 0; word-break: break-all; white-space: pre-wrap;"></pre>' +
      '<button id="horizon-agent-copy-btn" class="btn btn-primary" style="margin-top: 10px;">Copy Command</button>' +
      '</div>' +
      '</div>';
  } else {
    detailsCell.innerHTML =
      '<div class="todo-details-box">' +
      `<p>${item.details}</p>` +
      '</div>';
  }
  
  detailsRow.appendChild(detailsCell);

  // Wire up interactions
  detailsButton.addEventListener('click', () => {
    const isHidden = detailsRow.style.display === 'none';
    detailsRow.style.display = isHidden ? 'table-row' : 'none';
    detailsButton.textContent = isHidden ? 'Hide Details' : 'Show Details';
    
    // Initialize Horizon command builder if this is the horizon-client item
    if (item.id === 'horizon-client' && isHidden) {
      setTimeout(() => {
        initializeHorizonCommandBuilder();
      }, 100);
    }
    
    // Initialize Horizon Agent command builder if this is the horizon-agent item
    if (item.id === 'horizon-agent' && isHidden) {
      setTimeout(() => {
        initializeHorizonAgentCommandBuilder();
      }, 100);
    }
  });

  // Persist changes
  const updateState = () => {
    const allState = loadTodoState();
    allState[item.id] = {
      completed: completedCheckbox.checked,
      na: naCheckbox.checked,
      notes: textarea.value
    };
    saveTodoState(allState);
  };

  // Relationship between NA and Completed
  const applyNaState = () => {
    if (naCheckbox.checked) {
      completedCheckbox.checked = false;
      completedCheckbox.disabled = true;
      tr.classList.add('todo-na');
    } else {
      completedCheckbox.disabled = false;
      tr.classList.remove('todo-na');
    }
  };

  completedCheckbox.addEventListener('change', updateState);
  naCheckbox.addEventListener('change', () => {
    applyNaState();
    updateState();
  });
  textarea.addEventListener('input', updateState);

  // Initialise NA visual state
  applyNaState();

  return { mainRow: tr, detailsRow };
}

function initializeHorizonCommandBuilder() {
  const formContainer = document.getElementById('horizon-builder-form');
  if (!formContainer || formContainer.innerHTML !== '') return; // Already initialized

  const form = document.createElement('div');
  form.style.display = 'grid';
  form.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  form.style.gap = '15px';

  // Configuration for all fields
  const fields = [
    {
      id: 'silent-install',
      label: 'Silent Install',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'SILENT_INSTALL',
      mapValue: (val) => val === 'ON' ? '1' : '0',
      isSwitch: true // Special flag to indicate this controls the /silent switch
    },
    {
      id: 'autorestart',
      label: 'Auto Restart',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'AUTORESTART',
      mapValue: (val) => val === 'ON' ? '1' : '0',
      isSwitch: true // Special flag to indicate this controls the /autorestart switch
    },
    {
      id: 'ip-protocol',
      label: 'IP Protocol',
      type: 'select',
      options: ['IPv4', 'IPv6', 'Dual'],
      param: 'IP_PROTOCOL',
      mapValue: (val) => val
    },
    {
      id: 'fips-enabled',
      label: 'FIPS Enabled',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'FIPS_ENABLED',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'vdm-server',
      label: 'VDM Server Name',
      type: 'text',
      param: 'VDM_SERVER',
      mapValue: (val) => val
    },
    {
      id: 'login-current-user',
      label: 'Login as Current User',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'LOGIN_AS_CURRENT_USER',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'login-current-user-default',
      label: 'Login as Current User Default',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'LOGIN_AS_CURRENT_USER_DEFAULT',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'url-filtering-enabled',
      label: 'URL Filtering Enabled',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'URL_FILTERING_ENABLED',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'unc-redirection',
      label: 'UNC Redirection',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'UNC_REDIRECTION',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'tsso',
      label: 'TSSO (installed if Login as Current User = ON)',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'TSSO',
      mapValue: (val) => val === 'ON' ? '1' : '0',
      dependsOn: 'login-current-user',
      hidden: true // Hidden from user, auto-set based on login-current-user
    },
    {
      id: 'usb',
      label: 'USB',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'USB',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'html5-redirection',
      label: 'HTML5 Redirection',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'HTML5_REDIRECTION',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'desktop-shortcut',
      label: 'Desktop Shortcut',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'DESKTOP_SHORTCUT',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'start-menu-shortcut',
      label: 'Start Menu Shortcut',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'START_MENU_SHORTCUT',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'url-filters',
      label: 'URL Filters',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'URL_FILTERS',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'autoupdate',
      label: 'AutoUpdate',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'AUTO_UPDATE',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'keylogger-protection',
      label: 'Keylogger Protection',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'KEYLOGGER_PROTECTION',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    },
    {
      id: 'dotnet-install-skip',
      label: '.NET Install Skip',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'DOTNET_INSTALL_SKIP',
      mapValue: (val) => val === 'ON' ? '1' : '0'
    }
  ];

  // Create form fields
  fields.forEach(field => {
    // Skip hidden fields (they'll be handled automatically)
    if (field.hidden) {
      // Create hidden input for TSSO
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = field.id;
      hiddenInput.dataset.param = field.param;
      // TSSO defaults to ON since Login as Current User defaults to ON
      hiddenInput.value = 'ON';
      form.appendChild(hiddenInput);
      return;
    }

    const fieldDiv = document.createElement('div');
    fieldDiv.style.display = 'flex';
    fieldDiv.style.flexDirection = 'column';
    fieldDiv.style.gap = '5px';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.style.fontWeight = '500';
    label.style.color = '#2d3561';
    label.style.fontSize = '0.9rem';
    label.setAttribute('for', field.id);
    fieldDiv.appendChild(label);

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      input.id = field.id;
      input.style.padding = '8px';
      input.style.border = '1px solid #dee2e6';
      input.style.borderRadius = '4px';
      input.style.fontSize = '0.9rem';
      field.options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        optionEl.textContent = option;
        input.appendChild(optionEl);
      });
      // Set default values
      if (field.id === 'silent-install') {
        input.value = 'ON';
      } else if (field.id === 'autorestart') {
        input.value = 'OFF';
      } else if (field.id === 'ip-protocol') {
        input.value = 'IPv4';
      } else if (field.id === 'login-current-user') {
        input.value = 'ON';
      } else if (field.id === 'login-current-user-default') {
        input.value = 'ON';
      } else if (field.id === 'url-filters') {
        input.value = 'ON';
      } else if (field.id === 'usb') {
        input.value = 'ON';
      } else if (field.id === 'html5-redirection') {
        input.value = 'ON';
      } else if (field.id === 'desktop-shortcut') {
        input.value = 'ON';
      } else if (field.id === 'start-menu-shortcut') {
        input.value = 'ON';
      } else {
        input.value = 'OFF';
      }
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.id = field.id;
      input.placeholder = 'Enter server name';
      input.style.padding = '8px';
      input.style.border = '1px solid #dee2e6';
      input.style.borderRadius = '4px';
      input.style.fontSize = '0.9rem';
    }

    // Store field metadata
    input.dataset.param = field.param;
    input.dataset.mapValue = 'true';
    input.dataset.dependsOn = field.dependsOn || '';

    // Add listener to update TSSO when Login as Current User changes
    if (field.id === 'login-current-user') {
      input.addEventListener('change', () => {
        const tssoInput = document.getElementById('tsso');
        if (tssoInput) {
          // TSSO is automatically set in generateHorizonCommand, but keep hidden field in sync
          tssoInput.value = input.value === 'ON' ? 'ON' : 'OFF';
        }
      });
    }

    fieldDiv.appendChild(input);
    form.appendChild(fieldDiv);
  });

  // Add build button
  const buttonDiv = document.createElement('div');
  buttonDiv.style.gridColumn = '1 / -1';
  buttonDiv.style.marginTop = '10px';
  const buildButton = document.createElement('button');
  buildButton.textContent = 'Build Command Line';
  buildButton.className = 'btn btn-primary';
  buildButton.style.width = '100%';
  buildButton.style.maxWidth = '300px';
  buildButton.addEventListener('click', generateHorizonCommand);
  buttonDiv.appendChild(buildButton);
  form.appendChild(buttonDiv);

  formContainer.appendChild(form);
}

function generateHorizonCommand() {
  const params = [];
  
  // Get all input fields (including hidden ones)
  const formContainer = document.getElementById('horizon-builder-form');
  if (!formContainer) return;
  
  const inputs = formContainer.querySelectorAll('select, input[type="text"], input[type="hidden"]');
  
  // Get Login as Current User value first to determine TSSO
  const loginCurrentUser = document.getElementById('login-current-user');
  const loginCurrentUserValue = loginCurrentUser ? loginCurrentUser.value : 'OFF';
  
  // Get Silent Install value to determine if /silent switch should be included
  const silentInstall = document.getElementById('silent-install');
  const silentInstallValue = silentInstall ? silentInstall.value : 'ON';
  
  // Get Auto Restart value to determine if /autorestart switch should be included
  const autorestart = document.getElementById('autorestart');
  const autorestartValue = autorestart ? autorestart.value : 'OFF';
  
  inputs.forEach(input => {
    const param = input.dataset.param;
    if (!param) return;
    
    // Skip silent-install field - it's only used to control the /silent switch, not a parameter
    if (input.id === 'silent-install') {
      return;
    }
    
    // Skip autorestart field - it's only used to control the /autorestart switch, not a parameter
    if (input.id === 'autorestart') {
      return;
    }
    
    // Handle TSSO - automatically set based on Login as Current User
    if (input.id === 'tsso') {
      const tssoValue = loginCurrentUserValue === 'ON' ? '1' : '0';
      params.push(`${param}=${tssoValue}`);
      return;
    }
    
    let value = input.value.trim();
    
    // Skip empty text fields
    if (input.type === 'text' && !value) return;
    
    // Map ON/OFF to 1/0 for select fields (except IP_PROTOCOL which uses actual values)
    if (input.tagName === 'SELECT' && param !== 'IP_PROTOCOL') {
      value = value === 'ON' ? '1' : '0';
    }
    
    // Build parameter
    params.push(`${param}=${value}`);
  });

  // Build the full command - conditionally include /silent and /autorestart based on options
  const silentSwitch = silentInstallValue === 'ON' ? ' /silent' : '';
  const autorestartSwitch = autorestartValue === 'ON' ? ' /autorestart' : '';
  const command = `Horizon-Client-YYMM-y.y.y-xxxxxx.exe /install${silentSwitch}${autorestartSwitch} ${params.join(' ')}`;

  // Display the command
  const outputDiv = document.getElementById('horizon-command-output');
  const commandText = document.getElementById('horizon-command-text');
  if (outputDiv && commandText) {
    commandText.textContent = command;
    outputDiv.style.display = 'block';
    
    // Scroll to output
    outputDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Setup copy button
  const copyBtn = document.getElementById('horizon-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(command).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please copy manually.');
      });
    };
  }
}

function initializeHorizonAgentCommandBuilder() {
  const formContainer = document.getElementById('horizon-agent-builder-form');
  if (!formContainer || formContainer.innerHTML !== '') return; // Already initialized

  const form = document.createElement('div');
  form.style.display = 'grid';
  form.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  form.style.gap = '15px';

  // Configuration for all fields - defaults: most ON, except: 3D, sdosensor, helpdesk, serial, scanner, Geo, smartcard, perf tracker
  const fields = [
    {
      id: 'silent-install',
      label: 'Silent Install',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'SILENT_INSTALL',
      defaultValue: 'ON',
      isSwitch: true // Special flag to indicate this controls the /s switch
    },
    {
      id: 'autorestart',
      label: 'Auto Restart',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'AUTORESTART',
      defaultValue: 'OFF',
      isSwitch: true // Special flag to indicate this controls the /autorestart switch
    },
    {
      id: 'unc-redirection',
      label: 'UNC Redirection',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'UNC_REDIRECTION',
      defaultValue: 'ON'
    },
    {
      id: 'monitoring-agent',
      label: 'Monitoring Agent',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'MONITORING_AGENT',
      defaultValue: 'ON'
    },
    {
      id: 'dotnet-bypass',
      label: '.NET Bypass',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'DOTNET_BYPASS',
      defaultValue: 'ON'
    },
    {
      id: 'rdp',
      label: 'RDP',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'RDP',
      defaultValue: 'ON'
    },
    {
      id: '3d',
      label: '3D',
      type: 'select',
      options: ['ON', 'OFF'],
      param: '3D',
      defaultValue: 'OFF'
    },
    {
      id: 'url-filtering',
      label: 'URL Filtering',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'URL_FILTERING',
      defaultValue: 'ON'
    },
    {
      id: 'ip-version',
      label: 'IP Version',
      type: 'select',
      options: ['IPv4', 'IPv6'],
      param: 'IP_VERSION',
      defaultValue: 'IPv4'
    },
    {
      id: 'fips',
      label: 'FIPS',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'FIPS',
      defaultValue: 'ON'
    },
    {
      id: 'usb',
      label: 'USB',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'USB',
      defaultValue: 'ON'
    },
    {
      id: 'install-clone-agent',
      label: 'Install Clone Agent',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'INSTALL_CLONE_AGENT',
      defaultValue: 'ON'
    },
    {
      id: 'real-time-audio',
      label: 'Real Time Audio',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'REAL_TIME_AUDIO',
      defaultValue: 'ON'
    },
    {
      id: 'client-drive-redir',
      label: 'Client Drive Redir',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'CLIENT_DRIVE_REDIR',
      defaultValue: 'ON'
    },
    {
      id: 'serial',
      label: 'Serial',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'SERIAL',
      defaultValue: 'OFF'
    },
    {
      id: 'scanner-redir',
      label: 'Scanner Redir',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'SCANNER_REDIR',
      defaultValue: 'OFF'
    },
    {
      id: 'gelocation-redir',
      label: 'Gelocation Redir',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'GELOCATION_REDIR',
      defaultValue: 'OFF'
    },
    {
      id: 'smartcard',
      label: 'Smartcard',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'SMARTCARD',
      defaultValue: 'OFF'
    },
    {
      id: 'hzn-audio',
      label: 'HZN Audio',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'HZN_AUDIO',
      defaultValue: 'ON'
    },
    {
      id: 'windows-redir',
      label: 'Windows Redir',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'WINDOWS_REDIR',
      defaultValue: 'ON'
    },
    {
      id: 'blast-udp',
      label: 'Blast UDP',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'BLAST_UDP',
      defaultValue: 'ON'
    },
    {
      id: 'sdosensor',
      label: 'SDOSensor',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'SDOSENSOR',
      defaultValue: 'OFF'
    },
    {
      id: 'helpdesk',
      label: 'HelpDesk',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'HELPDESK',
      defaultValue: 'OFF'
    },
    {
      id: 'print-redir',
      label: 'Print Redir',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'PRINT_REDIR',
      defaultValue: 'ON'
    },
    {
      id: 'perf-tracker',
      label: 'Perf Tracker',
      type: 'select',
      options: ['ON', 'OFF'],
      param: 'PERF_TRACKER',
      defaultValue: 'OFF'
    }
  ];

  // Create form fields
  fields.forEach(field => {
    const fieldDiv = document.createElement('div');
    fieldDiv.style.display = 'flex';
    fieldDiv.style.flexDirection = 'column';
    fieldDiv.style.gap = '5px';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.style.fontWeight = '500';
    label.style.color = '#2d3561';
    label.style.fontSize = '0.9rem';
    label.setAttribute('for', field.id);
    fieldDiv.appendChild(label);

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      input.id = field.id;
      input.style.padding = '8px';
      input.style.border = '1px solid #dee2e6';
      input.style.borderRadius = '4px';
      input.style.fontSize = '0.9rem';
      field.options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option;
        optionEl.textContent = option;
        input.appendChild(optionEl);
      });
      // Set default value
      input.value = field.defaultValue || 'OFF';
    }

    // Store field metadata
    input.dataset.param = field.param;
    fieldDiv.appendChild(input);
    form.appendChild(fieldDiv);
  });

  // Add build button
  const buttonDiv = document.createElement('div');
  buttonDiv.style.gridColumn = '1 / -1';
  buttonDiv.style.marginTop = '10px';
  const buildButton = document.createElement('button');
  buildButton.textContent = 'Build Command Line';
  buildButton.className = 'btn btn-primary';
  buildButton.style.width = '100%';
  buildButton.style.maxWidth = '300px';
  buildButton.addEventListener('click', generateHorizonAgentCommand);
  buttonDiv.appendChild(buildButton);
  form.appendChild(buttonDiv);

  formContainer.appendChild(form);
}

function generateHorizonAgentCommand() {
  const params = [];
  
  // Get all input fields
  const formContainer = document.getElementById('horizon-agent-builder-form');
  if (!formContainer) return;
  
  // Get Silent Install value to determine if /s switch should be included
  const silentInstall = document.getElementById('silent-install');
  const silentInstallValue = silentInstall ? silentInstall.value : 'ON';
  
  // Get Auto Restart value to determine if /autorestart switch should be included
  const autorestart = document.getElementById('autorestart');
  const autorestartValue = autorestart ? autorestart.value : 'OFF';
  
  const inputs = formContainer.querySelectorAll('select');
  
  inputs.forEach(input => {
    const param = input.dataset.param;
    if (!param) return;
    
    // Skip silent-install field - it's only used to control the /s switch, not a parameter
    if (input.id === 'silent-install') {
      return;
    }
    
    // Skip autorestart field - it's only used to control the /autorestart switch, not a parameter
    if (input.id === 'autorestart') {
      return;
    }
    
    let value = input.value.trim();
    
    // Map ON/OFF to 1/0 for select fields (except IP_VERSION which uses actual values)
    if (input.tagName === 'SELECT' && param !== 'IP_VERSION') {
      value = value === 'ON' ? '1' : '0';
    }
    
    // Build parameter
    params.push(`${param}=${value}`);
  });

  // Build the full command - conditionally include /s and /autorestart based on options
  const silentSwitch = silentInstallValue === 'ON' ? ' /s' : '';
  const autorestartSwitch = autorestartValue === 'ON' ? ' /autorestart' : '';
  const command = `VMware-Horizon-Agent-YYMM-y.y.y-xxxxxx.exe${silentSwitch}${autorestartSwitch} ${params.join(' ')}`;

  // Display the command
  const outputDiv = document.getElementById('horizon-agent-command-output');
  const commandText = document.getElementById('horizon-agent-command-text');
  if (outputDiv && commandText) {
    commandText.textContent = command;
    outputDiv.style.display = 'block';
    
    // Scroll to output
    outputDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Setup copy button
  const copyBtn = document.getElementById('horizon-agent-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(command).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please copy manually.');
      });
    };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('todoTableBody');
  if (!tbody) return;

  const savedState = loadTodoState();

  TODO_ITEMS.forEach((item) => {
    const { mainRow, detailsRow } = createTodoRow(item, savedState);
    tbody.appendChild(mainRow);
    tbody.appendChild(detailsRow);
  });
});


