// Omnissa Horizon 8 blueprint notes for the Citrix-2-HZ Build checklist.
// Numbers and design rules are taken from the official Omnissa Tech Zone
// Horizon 8 Architecture / UAG / ports guides (Workspace ONE and Horizon Reference Architecture).

const OMNISSA_LINKS = {
  architecture: {
    label: 'Horizon 8 architecture (Omnissa Tech Zone)',
    url: 'https://techzone.omnissa.com/resource/horizon-8-architecture'
  },
  csMax: {
    label: 'Connection Server maximums and configuration',
    url: 'https://docs.omnissa.com/bundle/HorizonOverviewDeployment/page/HorizonConnectionServerMaximumsandConfiguration.html'
  },
  cpa: {
    label: 'Cloud Pod Architecture in Horizon 8',
    url: 'https://docs.omnissa.com/bundle/Horizon-Cloud-Pod-Architecture/page/CloudPodArchitectureinHorizon8.html'
  },
  uagArch: {
    label: 'Unified Access Gateway architecture',
    url: 'https://techzone.omnissa.com/resource/unified-access-gateway-architecture'
  },
  uagLb: {
    label: 'Load balancing Unified Access Gateway for Horizon 8',
    url: 'https://techzone.omnissa.com/resource/load-balancing-unified-access-gateway-horizon-8'
  },
  ports: {
    label: 'Network ports in Horizon 8',
    url: 'https://techzone.omnissa.com/resource/network-ports-horizon-8'
  },
  uagFw: {
    label: 'Firewall rules for DMZ-based UAG appliances',
    url: 'https://docs.omnissa.com/bundle/UnifiedAccessGatewayDeployandConfigureV2506/page/FirewallrulesforDMZ-basedUnifiedAccessGatewayappliances.html'
  },
  dem: {
    label: 'Dynamic Environment Manager architecture',
    url: 'https://techzone.omnissa.com/resource/dynamic-environment-manager-architecture'
  },
  appVolumes: {
    label: 'App Volumes architecture',
    url: 'https://techzone.omnissa.com/resource/app-volumes-architecture'
  }
};

const GUIDE_PAGES = {
  'data-center-design': {
    title: 'Data Center Design',
    summary:
      'Horizon is designed around pods and blocks, not a stretched Citrix site. One pod lives in one data center. Extra sites are extra pods, optionally joined with Cloud Pod Architecture.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'A pod is a group of interconnected Connection Servers that broker desktops and published apps.',
          'All Connection Servers in a pod must sit in a single data center on the same LAN / broadcast domain. Do not stretch a pod across a WAN or MAN.',
          'A pod supports up to 7 Connection Servers and up to 20,000 active sessions (desktop + RDSH).',
          'Capacity inside a pod is added as resource blocks (typically one hypervisor manager / vCenter per block).',
          'Scale beyond one datacenter or beyond 20,000 sessions by deploying another pod and federating with Cloud Pod Architecture (CPA).',
          'CPA is not a stretched cluster. Each pod stays local; global entitlements publish pools from multiple pods under one icon.',
          'Horizon Agents must be within 120 ms of the Connection Servers that broker them. Remote-agent models exist, but latency is a hard constraint.',
          'Large designs put Horizon management VMs (Connection Servers, App Volumes, databases) on a separate management cluster from desktop/RDSH hosts.'
        ]
      },
      {
        heading: 'Official scale numbers',
        table: {
          headers: ['Limit', 'Blueprint value'],
          rows: [
            ['Connection Servers per pod', '7'],
            ['Sessions per pod', '20,000'],
            ['CPA sessions', '250,000'],
            ['CPA pods / sites', '50 pods, 15 sites'],
            ['Agent-to-broker latency', '120 ms maximum']
          ]
        }
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'How many sites, and is the design active/active or active/passive?',
          'One pod per site, or multiple pods on the same site for scale?',
          'Will CPA global entitlements be used, and what scope (within pod / within site / all sites)?',
          'Where do resource blocks live relative to the brokers (same site vs remote agents)?',
          'Separate management cluster vs co-hosted on desktop hosts (acceptable only for smaller farms).'
        ]
      }
    ],
    sources: ['architecture', 'cpa', 'csMax']
  },
  controllers: {
    title: 'Controllers (Connection Servers)',
    summary:
      'Horizon Connection Servers replace Citrix Delivery Controllers and StoreFront in one role: they authenticate users and broker the session. After the protocol session is formed, traffic should not stay on the Connection Server.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'A Connection Server supports up to 4,000 sessions when secure gateways / tunnels are disabled on it.',
          'That drops to 2,000 sessions if Blast Secure Gateway, PCoIP Secure Gateway, or the HTTPS Secure Tunnel is enabled on the Connection Server.',
          'Omnissa does not generally recommend tunneling production sessions through Connection Servers. Put external traffic on Unified Access Gateway instead, so a broker outage does not kill live sessions.',
          'Deploy n+1 Connection Servers. The published 8,000-user reference architecture uses three brokers: two for load plus one for failure.',
          'Replica Connection Servers share LDAP/AD LDS configuration. There is no SQL site database like Citrix; each broker holds a replica of the pod config.',
          'Install Connection Servers on dedicated Windows Server VMs on the internal network.',
          'An events database should be configured per pod, and it should be local to that pod.',
          'Internal users hit a load-balanced Connection Server VIP. External users hit UAG, which then talks to a Connection Server on TCP 443.'
        ]
      },
      {
        heading: 'Sizing snapshot',
        table: {
          headers: ['Scenario', 'Sessions per Connection Server'],
          rows: [
            ['Direct / untunneled (recommended)', '4,000'],
            ['Tunneled through the Connection Server', '2,000'],
            ['Pod maximum', '7 servers / 20,000 sessions']
          ]
        }
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Target concurrent sessions per site, then size n+1 at 4,000 per broker (untunneled).',
          'Confirm Blast/PCoIP/HTTPS gateways stay disabled on Connection Servers.',
          'Windows Server version, CPU/RAM, and which OU the brokers live in.',
          'Events database type and location (one per pod, local).'
        ]
      }
    ],
    sources: ['architecture', 'csMax']
  },
  'load-balancing': {
    title: 'Load Balancing (Controllers)',
    summary:
      'Internal users should have a single namespace such as horizon.company.com in front of the Connection Servers. Persistence is required.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Use a load balancer VIP so load is even, maintenance is possible, and users have one FQDN.',
          'Connection Servers need session persistence (sticky / persistent connections) so XML-API traffic for a login stays on the same broker.',
          'The Omnissa reference architecture uses source-IP affinity for Connection Server load balancing.',
          'The load balancer itself should be HA (active/passive or equivalent) so it is not a single point of failure.',
          'TLS certificates must match the VIP name and be trusted on every Connection Server (and on UAG if it targets that name).',
          'Preferred external design: do not put a load balancer in-line between UAG and Connection Servers. Each UAG points at a specific Connection Server URL so it can detect a dead broker and take itself out of the external VIP.',
          'A Connection Server VIP is still valid for internal users only, or as a shared target when an in-line UAG-to-CS load balancer is required.'
        ]
      },
      {
        heading: 'Health and persistence',
        bullets: [
          'Health-check the Connection Server HTTPS login path, not just TCP 443 open.',
          'See Omnissa KB 56636 for health-monitor strings, timeouts, and persistence values used with Horizon 7.x / 8.',
          'See Omnissa KB 2146312 for Connection Server load-balancing guidance.',
          'If persistence is wrong, users get flaky logons and missing entitlements rather than a clean failover.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Internal FQDN / VIP (for example horizon.company.com).',
          'Load-balancer platform (NetScaler, F5, Windows, UAG built-in HA is for UAG, not Connection Servers).',
          'Persistence method (source IP vs cookie) and timeout.',
          'Whether UAG targets individual Connection Servers (preferred) or the internal VIP.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'uag-external-access': {
    title: 'UAG (External Access)',
    summary:
      'Unified Access Gateway is the Omnissa edge appliance for Horizon. It replaces a VPN or Citrix Gateway for Blast/PCoIP and discards unauthenticated traffic in the DMZ.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Deploy UAG in the DMZ (single DMZ is the normal on-premises pattern). A double DMZ is optional and only used when the organisation mandates two hops.',
          'Do not expose Connection Servers to the Internet. External clients authenticate through UAG; UAG then talks to Connection Servers and to agents.',
          'Standard UAG size is typically 2,000 Horizon sessions per appliance. Extra-large (from UAG 2512) can support 4,000.',
          'Always deploy at least two UAGs. The 8,000-user reference architecture uses six standard UAGs (2-to-1 against three Connection Servers) with no in-line CS load balancer.',
          'UAG can do extra authentication (RADIUS, SAML, certificate) in front of the Connection Server.',
          'True SSO (Enrollment Server) is the Horizon equivalent of FAS when users authenticate with SAML / Omnissa Access and still need a Windows logon.',
          'Same Connection Servers can serve internal and external users; only the front door changes (VIP vs UAG).'
        ]
      },
      {
        heading: 'Traffic model',
        bullets: [
          'Client → UAG VIP (XML-API on TCP 443) → Connection Server TCP 443.',
          'Protocol session then goes Client → UAG gateway → Horizon Agent (Blast TCP/UDP 22443, or PCoIP 4172).',
          'Unauthenticated packets are dropped in the DMZ. Only traffic for an authenticated user is forwarded.',
          'Basic UAG mode (one appliance in the DMZ) is the usual choice. Cascade / double-hop is for a mandated double DMZ.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'External FQDN, public certificates, and whether Blast uses 443 only or also 8443.',
          'UAG size and count vs Connection Server count (keep n+1 on both layers).',
          'Auth methods: AD password, RADIUS/MFA, SAML, True SSO.',
          'Single NIC vs dual NIC (Internet + backend) and which networks the backend NIC may reach.'
        ]
      }
    ],
    sources: ['architecture', 'uagArch', 'csMax']
  },
  'load-balancing-uag': {
    title: 'Load Balancing (UAG)',
    summary:
      'Users must hit one external namespace. The primary HTTPS session and the Blast/PCoIP secondary protocols must land on the same UAG appliance or the session is dropped in the DMZ.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Omnissa strongly recommends a load-balanced VIP in front of UAG (third-party LB or UAG built-in HA).',
          'The first connection is the Horizon XML-API control protocol on HTTPS 443. The load balancer picks a UAG.',
          'Secondary protocols (Blast TCP/UDP 8443 or 443, PCoIP TCP/UDP 4172, UDP 443 tunnel) must return to that same UAG so it can authorise them.',
          'Affinity must last for the whole session (Horizon default maximum 10 hours). Source-IP persistence is what the reference architecture used.',
          'If clients sit behind NAT that shares one public IP, source-IP affinity will pin everyone to one UAG. Use multiple public VIPs or per-UAG port groups instead.',
          'UAG built-in HA supports up to 10,000 concurrent connections in a cluster as an alternative to a third-party load balancer.',
          'Health-check the UAG Horizon path (commonly /favicon.ico or a dedicated monitor). A UAG with 443 up but UDP Blast down should not stay in the pool if you rely on UDP.'
        ]
      },
      {
        heading: 'Ports on the external VIP',
        table: {
          headers: ['Port', 'Role'],
          rows: [
            ['TCP 443', 'XML-API, tunnel, Blast-on-443'],
            ['UDP 443', 'UDP tunnel (forwarded internally on UAG)'],
            ['TCP/UDP 8443', 'Blast Extreme (optional if Blast is on 443)'],
            ['TCP/UDP 4172', 'PCoIP (only if PCoIP is in use)']
          ]
        }
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'External VIP name (for example horizon-ext.company.com).',
          'Affinity method and timeout (≥ session timeout, default 10 hours).',
          'SSL bridge vs offload / re-encrypt.',
          'Whether secondary protocols go through the VIP or bypass it via per-UAG blastExternalURL / pcoipExternalURL / tunnelExternalURL.'
        ]
      }
    ],
    sources: ['architecture', 'uagLb', 'uagArch']
  },
  'horizon-agent': {
    title: 'Horizon Agent',
    summary:
      'The Horizon Agent is installed on every desktop, RDSH host, or physical PC that Horizon will broker. It is the equivalent of the Citrix VDA.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Install the Agent in the golden image before you publish Instant Clone pools or RDSH farms.',
          'The Agent lets Connection Servers manage the machine and lets Horizon Client form a Blast / PCoIP / RDP session to it.',
          'Agents must remain within 120 ms of the Connection Servers.',
          'Do not enable unused redirection features. USB, scanner, serial, smart card, and 3D/vGPU are explicit install-time choices and increase attack surface and image size.',
          'Blast Extreme is the recommended display protocol in the Omnissa reference architecture (TCP and UDP, optional NVIDIA hardware encode).',
          'Instant Clone pools/farms recompose from the golden image; Agent upgrades are done by updating the image and pushing a new snapshot.',
          'Physical PCs can run the Agent for hybrid brokered access, but they are not Instant Cloned.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Which Agent features are required per image (USB, CDR, HTML5 redirection, scanner, serial, smart card, RTAV, Print Redir).',
          'IPv4 vs IPv6, FIPS, and silent-install command line (use the builder in the checklist details).',
          'vGPU / 3D pools vs CPU-only pools.',
          'How Agent version is kept in step with Connection Server version.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'horizon-client': {
    title: 'Horizon Client',
    summary:
      'Users connect with Horizon Client or the HTML5 web client. The native client is required for the full protocol feature set; HTML Access is the fallback when software cannot be installed.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Internal users point the client at the Connection Server VIP. External users point it at the UAG VIP. Do not mix those FQDNs.',
          'Blast is selected on the pool and can be overridden on the client. PCoIP and RDP remain supported.',
          'Favourites, multi-monitor, client drive, USB, and printing are client-side capabilities that must be matched by Agent features and policy.',
          'HTML Access (browser) uses Blast through UAG/Connection Server and does not provide the full USB/device set.',
          'Client versions should stay current with the pod. Mixed old clients are a common source of Blast/UDP issues.',
          'Workspace ONE / Omnissa Access can launch Horizon entitlements with True SSO so the user never types a Windows password.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Default client (Windows, Mac, Linux, iOS, Android, Chrome, HTML Access).',
          'Whether Login as Current User / TSSO is allowed on corporate Windows endpoints.',
          'URL filtering, USB, and shortcut deployment via the silent installer (use the builder in the checklist).',
          'How the client is packaged (SCCM, Intune, golden laptop image).'
        ]
      }
    ],
    sources: ['architecture']
  },
  'base-images': {
    title: 'Base Images',
    summary:
      'Horizon Instant Clone technology builds pools and RDSH farms from a golden image VM. Patch once, push a snapshot, and the clones are recreated from that image.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Create a golden image VM, install the OS, apps that belong on the image, Horizon Agent, and (if used) App Volumes / DEM / FSLogix agents.',
          'Instant Clones replace View Composer linked clones. They provision from a replica (and optionally a parent VM in memory on each host).',
          'Parent VMs speed provisioning but consume RAM on every host. For sparse pools or RDSH farms Horizon can skip the parent and clone from the replica (mode B).',
          'A single Instant Clone pool or farm can mix parent and non-parent clones. Override the scheme per pool if needed.',
          'Use vSphere HA for management VMs. Size vCenter for clone churn (logoff-delete-recreate on floating pools is a vCenter load, not just a storage load).',
          'Do not treat the golden image like a persistent desktop. Keep it clean; user data belongs in profile containers or App Volumes writables.',
          'Sysprep / Instant Clone prep is handled by Horizon during pool publish. Confirm domain join OU, naming, and unattend settings on the pool, not ad-hoc on the replica.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'How many golden images (OS, GPU, specialised apps).',
          'Patch cadence and who publishes the new snapshot.',
          'Parent VM vs replica-only Instant Clones (RAM vs provision speed).',
          'Which agents live in the image vs arrive via App Volumes.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'citrix-catalogs': {
    title: 'Citrix Catalogs → Horizon Farms / Pools',
    summary:
      'A Citrix Machine Catalog maps to a Horizon desktop pool (VDI) or RDSH farm (session hosts). Entitlements then sit on the pool/farm, or on a CPA global entitlement that spans pods.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'One automated Instant Clone pool/farm is built from one golden image and lives in one pod / vCenter resource block.',
          'If the same image must run in two clusters or two pods, publish two pools/farms and load-balance with a global entitlement (CPA) or two icons.',
          'Do not try to stretch one catalog across two data centers. That is the Citrix-site habit Horizon does not copy.',
          'vCenter is the delimiter of a resource block. The 8,000-user RA split 8,000 Instant Clones across two vCenters to shrink the failure domain, even though one vCenter can technically host that count.',
          'Pool settings define VM naming, AD OU, datastore/cluster, spare VMs, and power policy — the same decisions MCS catalog create asks for.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Map each Citrix catalog to a Horizon pool or farm (and to a pod / vCenter).',
          'Which catalogs become global entitlements across pods.',
          'Naming standard and OU per pool.',
          'Spare VM count for floating pools so logoff storms do not wait on vCenter.'
        ]
      }
    ],
    sources: ['architecture', 'cpa']
  },
  'desktop-types': {
    title: 'Desktop Types',
    summary:
      'Horizon delivers Windows VDI, Linux VDI, RDSH published desktops/apps, Linux-hosted apps, and physical PCs. Persistence is a pool setting, not a separate product.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Floating Instant Clone VDI: user gets a clean VM; it is often deleted or refreshed at logoff. Closest to Citrix random non-persistent MCS.',
          'Dedicated / persistent Instant Clone or full-clone VDI: user returns to the same VM. Use when local data or GPU assignment must stick.',
          'RDSH farms: session-based desktops and published applications (Citrix XenApp equivalent).',
          'Blast is the RA display protocol. PCoIP and RDP remain available per pool.',
          'Match pool type to profile design: floating pools need FSLogix/DEM; dedicated pools can keep a local profile but that fights image refresh.',
          'vGPU / 3D is a separate pool with NVIDIA GRID and the 3D Agent option.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Which use cases are floating VDI, dedicated VDI, RDSH published apps, or RDSH desktop.',
          'GPU vs standard pools.',
          'Linux or physical PC brokered access, if any.',
          'Refresh / delete-on-logoff vs persistent disks.'
        ]
      }
    ],
    sources: ['architecture']
  },
  profiles: {
    title: 'Profiles',
    summary:
      'Omnissa Dynamic Environment Manager captures OS and application settings. Many Horizon designs pair DEM with Microsoft FSLogix profile containers for the bulk of the user profile.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'DEM is the Omnissa profile / environment product in the Horizon reference architecture. It stores configuration on a file share (IT config share + profile archive share).',
          'In multi-site designs the IT config share is replicated (users only need read). Profile archive shares are active in one site and replicated for DR.',
          'FSLogix is Microsoft’s containerised profile solution and is widely used on Horizon floating desktops. Expect several GB per user unless Office/Outlook and exclusions are tuned.',
          'Install DEM FlexEngine and/or FSLogix in the golden image. Path and share permissions are GPO or DEM configuration, not a Horizon pool setting.',
          'Do not put the profile share on the same datastore that holds Instant Clone replicas if you can avoid it — login storms will fight clone I/O.',
          'Folder redirection can still sit beside DEM/FSLogix for Documents/Desktop if it is already in production and healthy.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'DEM only, FSLogix only, or FSLogix container + DEM for settings/shortcuts.',
          'Share path, sizing (users × GB), exclusions, and Office container split.',
          'Multi-site share strategy (active/active vs replicate for DR).',
          'What happens on a golden-image push (profile must survive Instant Clone refresh).'
        ]
      }
    ],
    sources: ['architecture', 'dem']
  },
  'citrix-upm': {
    title: 'Citrix UPM',
    summary:
      'Citrix User Profile Management is not a Horizon component and is not supported as the Horizon profile solution. Retire it on images that will be brokered by Horizon.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Remove UPM from golden images that will run Horizon Agent.',
          'Translate UPM inclusions/exclusions into FSLogix redirections.xml / DEM Flex config.',
          'UPM profile stores are Citrix-format. Plan a one-way migration or a clean profile on cutover; do not expect a dual-stack logon.',
          'If a pilot user still has UPM GPOs linked, those GPOs will fight DEM/FSLogix. Scope them off the Horizon OUs.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Cutover method: new profiles vs convert.',
          'GPO unlink date for UPM on Horizon OUs.',
          'Which UPM exceptions must be rebuilt in DEM/FSLogix.'
        ]
      }
    ],
    sources: ['dem']
  },
  redirection: {
    title: 'Folder Redirection',
    summary:
      'If folder redirection already works in Citrix, Omnissa designs usually keep it unless there is a strong reason to collapse everything into the profile container.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Folder redirection is independent of Horizon. It is GPO + file share.',
          'Combining FSLogix containers with redirected Desktop/Documents reduces container size and is a common production pattern.',
          'Redirecting AppData is where logons get slow. Prefer DEM or FSLogix for AppData, not classic redirection.',
          'Shares used for redirection must be available at the site the desktop boots in (same multi-site file strategy as profiles).'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Keep existing redirection or move those folders into FSLogix.',
          'Which folders stay redirected (Desktop, Documents, Pictures, Downloads).',
          'Offline files: usually off for VDI.'
        ]
      }
    ],
    sources: ['dem']
  },
  'ou-design': {
    title: 'OU Design',
    summary:
      'Horizon Instant Clone pools join machines to an OU you specify on the pool. That OU is where computer GPOs and permissions land.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Create Horizon-specific computer OUs if Citrix computer GPOs would break Instant Clones (PVS/MCS hooks, UPM, VDA-only settings).',
          'Reuse existing user GPOs by keeping users in their current user OUs; only the computer object moves.',
          'Pool creation needs a domain-join account with create/delete computer rights in that OU (Instant Clones recreate computer accounts).',
          'Separate OUs per pool type (VDI floating, VDI dedicated, RDSH) so GPO loopback and Agent policy stay tidy.',
          'Block inheritance only when you have a full replacement GPO set; otherwise you lose baseline security settings.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'OU tree for Horizon computers vs reuse of Citrix OUs.',
          'Domain-join service account and delegated rights.',
          'Whether computer GPOs are copied, linked, or rewritten.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'group-policy': {
    title: 'Group Policy',
    summary:
      'User experience that today lives in GPO still applies to Horizon. Horizon-specific ADMX templates add protocol, USB, and Agent settings on top.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Import Horizon GPO administrative templates (ADMX) into Central Store for Agent, Client, and Connection Server settings.',
          'Loopback merge is typical on VDI computer OUs so user settings apply to anyone who lands on that pool.',
          'DEM can replace many user GPOs (shortcuts, printers, drive maps) with condition-based rules. GPO remains the right place for security baselines.',
          'Do not ship Citrix policy CSEs onto Horizon images.',
          'Test logon time: too many user GPOs plus FSLogix plus App Volumes will show up as “Horizon is slow” when it is still AD.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Which existing GPOs stay, which move to DEM, which are dropped.',
          'Loopback mode on VDI OUs.',
          'Where Horizon ADMX live (Central Store).'
        ]
      }
    ],
    sources: ['architecture', 'dem']
  },
  'citrix-policies': {
    title: 'Citrix Policies → GPO / DEM',
    summary:
      'Citrix Studio policies have no 1:1 import into Horizon. Map each setting to a Horizon GPO, a DEM condition, or an Agent install flag.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Protocol settings (codec, frame rate, USB) become Horizon Agent / Client GPOs or pool protocol settings. Blast Extreme is the RA default.',
          'Drive mapping, printers, shortcuts, and environment variables are DEM strengths (condition filters beat GPO item-level targeting for many EUC cases).',
          'Session limits, clipboard, and device redirection have Horizon policy equivalents — confirm behaviour, do not assume identical defaults.',
          'Keep a gap list: anything Citrix-only (some HDX features, Adaptive Transport quirks) needs a business sign-off, not a silent drop.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Owner of the Citrix policy export and the mapping spreadsheet.',
          'What must be DEM vs GPO vs pool default.',
          'UAT cases that prove printer, clipboard, USB, and audio parity.'
        ]
      }
    ],
    sources: ['architecture', 'dem']
  },
  monitoring: {
    title: 'Monitoring',
    summary:
      'Horizon Console is the first-line support tool (sessions, events, helpdesk). Omnissa Intelligence and third-party tools (ControlUp and others) sit beside it.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Horizon Console runs on every Connection Server (Tomcat). Point support at the internal VIP.',
          'Events go to the per-pod events database. Console search is only as good as that DB and retention.',
          'Connecting the pod to Horizon Control Plane (Edge Gateway) unlocks cloud monitoring / Intelligence options and subscription licensing.',
          'ControlUp and similar agents remain supported on Horizon desktops; install them in the golden image if they are the ops standard.',
          'Do not rely on Director-style historical trends unless you add a monitoring product — Console is operational, not a long-term capacity warehouse.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Primary support console and who is allowed in (see Roles).',
          'Whether ControlUp / other APM stays.',
          'Edge Gateway / Control Plane yes or no.',
          'Alert routing (SMTP, syslog, SIEM).'
        ]
      }
    ],
    sources: ['architecture']
  },
  licences: {
    title: 'Licences',
    summary:
      'Horizon licensing is edition + metric (named user, concurrent, subscription vs term). Subscription features use Horizon Control Plane and an Edge Gateway per pod.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Confirm edition (Standard / Advanced / Enterprise equivalents and current Omnissa SKUs) against required features: Instant Clone, App Volumes, DEM, published apps, vGPU.',
          'Subscription licensing and cloud services require a Horizon Edge Gateway appliance per pod connected to Horizon Control Plane.',
          'Count concurrent sessions (including RDSH) against Connection Server and UAG scale, not just named-user purchase counts.',
          'DR / second-site entitlements are a commercial conversation — CPA does not magically include extra licences.',
          'App Volumes and DEM may be bundled or separate depending on SKU. Do not assume they are in the base licence.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'SKU, metric, and term with the vendor.',
          'Whether Edge Gateway / Control Plane will be deployed.',
          'DR licence position.',
          'Feature pack for App Volumes / DEM / vGPU.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'citrix-wem-dem': {
    title: 'Citrix WEM vs DEM',
    summary:
      'Dynamic Environment Manager is the Omnissa environment manager. It is the closest product to Citrix WEM: shortcuts, mappings, printers, and condition-based user settings.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'DEM FlexEngine runs on the desktop/RDSH; configuration lives on a central file share, not in a SQL database like WEM.',
          'Install the DEM management console on the Connection Servers (or a management jump box). Multiple consoles can edit the same config share.',
          'DEM conditions (client name, OU, AD group, horizon pool) replace a lot of WEM filters and GPO ILT.',
          'Multi-site: replicate the IT config share; keep profile archives site-local with DR replicas.',
          'DEM is settings, not the full user profile hive. Pair with FSLogix when users need a roaming NTUSER.DAT / Office cache.',
          'Helpdesk can use DEM application blocking, triggered tasks, and logon/logoff actions — map those from WEM one by one.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Which WEM actions migrate in wave 1 vs stay as GPO.',
          'Config share path and who can write to it.',
          'Whether DEM also owns printers/drives or those stay on GPO/print server.'
        ]
      }
    ],
    sources: ['dem', 'architecture']
  },
  'third-party-env-tools': {
    title: 'AppSense / RES / Ivanti',
    summary:
      'Third-party environment managers are supported on Horizon as long as the vendor supports the target OS and the agent is in the image. They do not replace Connection Servers or Instant Clone.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Confirm vendor support matrix for the Windows version you will gold-image.',
          'Install the agent in the golden image; Instant Clone refresh must not wipe its config (keep config on a share or in the profile container).',
          'Decide DEM vs keep Ivanti/AppSense vs dual-run during migration. Dual-run is the usual cause of double mappings and slow logons.',
          'UAT every printer, drive, and privilege elevation action. These tools fail quietly on clone desktops when computer names change every logon.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Keep, replace with DEM, or hybrid with an end date.',
          'Licence position on the new OS.',
          'Who owns the cutover of action sets.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'citrix-app-layering': {
    title: 'Citrix App Layering → App Volumes / golden image',
    summary:
      'Horizon does not clone Citrix App Layering. Omnissa App Volumes is the layer/package product. Anything else is installed in the golden image or packaged with ThinApp.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'App Volumes Manager assigns packages and writable volumes to users, groups, or computers. See the App Volumes architecture chapter for multi-site (one App Volumes instance per site in the RA).',
          'Core OS + Horizon Agent + FSLogix/DEM stay in the golden image. Layered apps attach at logon/startup.',
          'Writable volumes are for user-installed apps on floating desktops — use sparingly; they complicate image refresh.',
          'ThinApp remains the tool for capturing an old OS app and running it on a new OS without a native install.',
          'There is no App Layering “elastic layer” equivalent besides App Volumes packages. Do not leave Citrix ELM in the Horizon design.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'App Volumes yes/no, and which apps are packages vs baked into the image.',
          'ThinApp candidates (legacy OS apps).',
          'Writable volumes or not.'
        ]
      }
    ],
    sources: ['appVolumes', 'architecture']
  },
  'citrix-mcs': {
    title: 'Citrix MCS → Instant Clone farms / pools',
    summary:
      'Horizon Instant Clone pools and RDSH farms are the MCS analogue: many machines from one snapshot, automated naming, OU, and cluster/datastore selection.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Pool/farm wizard chooses resource pool, datastores, network, naming pattern, AD OU, and spare VM count — same conversation as MCS catalog create.',
          'Pushing a new image is a publish/recreate, not a Citrix “update catalog” with the same disk differencing chain. Plan a maintenance window or rolling recreate.',
          'vCenter performance during Instant Clone operations is a first-class design input. Split blocks if clone churn is bursty (shift-change logoff).',
          'There is no MCS I/O optimization driver to tune; storage design is replica + clone disks + optional persistent/writable volumes.',
          'Power policy and minimum/maximum farm size replace MCS buffer/keep-on settings.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Cluster, datastore, and VLAN per pool.',
          'Naming and OU.',
          'Spare VMs and power-on schedule.',
          'Image publish process and rollback snapshot.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'citrix-pvs': {
    title: 'Citrix PVS',
    summary:
      'Horizon has no Provisioning Services streaming product. Instant Clones are the standard replacement. Do not design a PVS-like boot-from-SAN farm on Horizon.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'There is no PVS streaming I/O path, no write cache disk in the PVS sense, and no boot NIC design.',
          'Fast image update is Instant Clone publish from a new snapshot, not a vDisk version seal.',
          'If the current Citrix farm depends on PVS for 5-minute image rollback, document that Instant Clone rollback is “republish previous snapshot”, which is fast but not identical.',
          'RDSH farms Instant Clone the session hosts the same way VDI pools Instant Clone desktops.',
          'See the Citrix MCS topic for the positive design (pool/farm settings). This topic exists so PVS-specific work (TFTP, CIFS vDisk store, write cache) is explicitly retired.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Confirm no PVS infrastructure is kept “just in case” for Horizon.',
          'How image rollback will be demonstrated in UAT.',
          'What happens to existing PVS write-cache / persistent disks (data migration).'
        ]
      }
    ],
    sources: ['architecture']
  },
  logging: {
    title: 'Logging',
    summary:
      'Each Horizon pod should have a local events database. Syslog is recommended for SIEM. Console search is the helpdesk interface into those events.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Configure an events database per pod, local to that pod. Do not share one events DB across stretched sites.',
          'Supported database engines are listed in the Omnissa interoperability matrix (SQL Server is the usual on-prem choice).',
          'Send logs to syslog for retention beyond what Console search needs. Connection Server Windows logs plus UAG appliance logs belong in the same SIEM stream.',
          'UAG and Connection Server audits (admin actions, failed logons) are what you will need for security reviews.',
          'Edge Gateway, if used, has its own port requirements into Control Plane — include those in the logging/firewall pack.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Events DB platform, size, and backup.',
          'Syslog target and retention.',
          'Who reviews admin audit events.'
        ]
      }
    ],
    sources: ['architecture', 'ports']
  },
  consoles: {
    title: 'Consoles',
    summary:
      'Horizon Console is a web app on every Connection Server. DEM has a separate Windows console. App Volumes has its own manager UI.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Administrators browse to a Connection Server or the internal load-balanced FQDN. There is no Windows MMC “Studio” for core Horizon.',
          'Certificate on the VIP must be trusted or console users will fight TLS warnings all day.',
          'Install DEM console on all Connection Servers (RA recommendation) so any broker can manage the config share.',
          'App Volumes Manager is a separate web console; in the RA each site has its own App Volumes instance.',
          'vCenter, NSX, and Windows admin tools remain part of the day-2 toolbox — Horizon Console does not replace them.',
          'Restrict console access with Horizon roles/permissions (see Roles) and by not publishing the console on the UAG Internet VIP unless you intend to.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Which FQDN admins use.',
          'Whether console is reachable from the Internet (usually no).',
          'Where DEM and App Volumes consoles are installed.'
        ]
      }
    ],
    sources: ['architecture', 'dem']
  },
  roles: {
    title: 'Roles',
    summary:
      'Horizon has roles and permissions on the Connection Server, conceptually like Citrix delegated administration (roles + scopes). Convert the Citrix audit, do not invent a parallel model.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Map Citrix roles (Full Admin, helpdesk, catalog admin, read-only) to Horizon permission sets and folders/access groups.',
          'Helpdesk typically needs session control (disconnect, logoff, send message) without pool-create rights.',
          'vCenter rights are separate: Instant Clone operations need a vCenter service account with the Horizon-documented privilege set.',
          'DEM and App Volumes have their own admin groups. Add those to the same RACI so “who can change a shortcut” is not only a Horizon Console question.',
          'Use the Citrix-2-HZ audit export as the source list of who can do what today.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Role catalogue and named groups.',
          'Whether external support vendors get read-only Console.',
          'Break-glass domain admin vs Horizon Full Administrator.'
        ]
      }
    ],
    sources: ['architecture']
  },
  peripherals: {
    title: 'Peripherals',
    summary:
      'USB, scanners, printers, microphones, and client drives are Agent + Client + policy. They are the highest-risk UAT items in a Citrix-to-Horizon move.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Each device class is an Agent install option and a GPO/DEM allow-list. Installing USB globally then blocking in policy is messier than installing only what is required.',
          'External USB often needs TCP 32111 from UAG to the Agent (framework channel) in addition to Blast.',
          'Printers: native client printing, location-based DEM printers, or a print server. Citrix UPD ≠ Horizon printer redirection; test the actual driver.',
          'RTAV (real-time audio-video) is the webcam/headset path. Confirm it is in the Agent and allowed through UAG.',
          'Smart cards need extra Agent options and usually certificate-based UAG or True SSO design.',
          'Inventory every device from the Citrix farm (USB filters, scanner redirection, serial) before the first UAT wave.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Device inventory and UAT owners.',
          'Which Agent features are on per image (the Agent command-line builder in the checklist).',
          'Printer strategy.',
          'Smart card / analog dictation / niche USB that may need vendor Horizon support letters.'
        ]
      }
    ],
    sources: ['architecture', 'uagFw', 'ports']
  },
  thinapp: {
    title: 'ThinApp',
    summary:
      'ThinApp captures an application on one OS and runs it on another without a native install. It is the leftover tool when App Volumes or a rebuilt golden image cannot carry a legacy app.',
    sections: [
      {
        heading: 'Blueprint rules',
        bullets: [
          'Use ThinApp for OS-mismatch apps (old Java, 32-bit only, installer that will not run on the new gold image).',
          'Deliver as a standalone EXE or wrapped MSI through existing software distribution or as a DEM shortcut to a share.',
          'ThinApp is not an image-layering platform. Do not ThinApp the bulk of the estate; that is App Volumes or the golden image.',
          'Capture machines should match the old OS; runtime is the new Horizon image. Test file/registry isolation and licensing dongles.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Candidate app list and owner.',
          'Capture OS and update process.',
          'How packages are updated without a full reimage.'
        ]
      }
    ],
    sources: ['architecture']
  },
  'firewall-rules': {
    title: 'Firewall Rules',
    summary:
      'Blast is the recommended protocol. Horizon UDP is bidirectional — stateful firewalls must allow the reply datagrams. Citrix 1494/2598 do not apply.',
    sections: [
      {
        heading: 'Internal Blast (client to agent)',
        table: {
          headers: ['Source', 'Destination', 'Port', 'Purpose'],
          rows: [
            ['Horizon Client', 'Connection Server', 'TCP 443', 'Logon / XML-API'],
            ['Horizon Client', 'Agent', 'TCP/UDP 22443', 'Blast Extreme'],
            ['Horizon Client', 'Agent', 'TCP/UDP 4172', 'PCoIP (if used)'],
            ['Connection Server', 'Connection Server', 'TCP 4100, 4001, 4002, 135 + RPC dynamic', 'Replica / JMS'],
            ['Connection Server', 'Active Directory', 'TCP 389/636, 88, 445, 53', 'LDAP/LDAPS, Kerberos, GPO, DNS']
          ]
        }
      },
      {
        heading: 'External via UAG (DMZ)',
        table: {
          headers: ['Source', 'Destination', 'Port', 'Purpose'],
          rows: [
            ['Internet', 'UAG', 'TCP 443', 'XML-API, tunnel, Blast-on-443'],
            ['Internet', 'UAG', 'UDP 443', 'UDP tunnel'],
            ['Internet', 'UAG', 'TCP/UDP 8443', 'Blast (optional if on 443)'],
            ['Internet', 'UAG', 'TCP/UDP 4172', 'PCoIP (optional)'],
            ['UAG', 'Connection Server', 'TCP 443', 'Broker logon'],
            ['UAG', 'Agent', 'TCP/UDP 22443', 'Blast'],
            ['UAG', 'Agent', 'TCP/UDP 4172', 'PCoIP'],
            ['UAG', 'Agent', 'TCP 32111', 'USB framework channel'],
            ['UAG', 'Agent', 'TCP 9427', 'MMR / CDR'],
            ['UAG', 'Agent', 'TCP 3389', 'RDP only if RDP is offered']
          ]
        }
      },
      {
        heading: 'Cloud Pod Architecture extra ports',
        bullets: [
          'TCP 8472 — inter-pod VIPA.',
          'TCP 22389 — CPA global LDAP.',
          'TCP 22636 — CPA global LDAPS.',
          'TCP 135 + dynamic RPC 49152–65535 between Connection Servers in the federation.',
          'Replica traffic inside a pod also needs JMS 4001/4002/4100 and RPC. Do not forget east-west rules between brokers.'
        ]
      },
      {
        heading: 'Decisions to capture',
        bullets: [
          'Blast on 443 only vs also opening 8443.',
          'Whether PCoIP is retired (then 4172 can stay closed).',
          'USB required externally (32111).',
          'CPA yes/no (extra inter-site ports).',
          'Micro-segmentation between pools is optional in the RA; classic VLAN + firewall was the published decision.'
        ]
      }
    ],
    sources: ['ports', 'uagFw', 'architecture']
  }
};

const GUIDE_ORDER = [
  'data-center-design',
  'controllers',
  'load-balancing',
  'uag-external-access',
  'load-balancing-uag',
  'horizon-agent',
  'horizon-client',
  'base-images',
  'citrix-catalogs',
  'desktop-types',
  'profiles',
  'citrix-upm',
  'redirection',
  'ou-design',
  'group-policy',
  'citrix-policies',
  'monitoring',
  'licences',
  'citrix-wem-dem',
  'third-party-env-tools',
  'citrix-app-layering',
  'citrix-mcs',
  'citrix-pvs',
  'logging',
  'consoles',
  'roles',
  'peripherals',
  'thinapp',
  'firewall-rules'
];

function escapeGuideText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSection(section) {
  const parts = [`<h2>${escapeGuideText(section.heading)}</h2>`];
  if (section.paragraphs) {
    section.paragraphs.forEach((p) => {
      parts.push(`<p>${escapeGuideText(p)}</p>`);
    });
  }
  if (section.bullets) {
    parts.push('<ul>');
    section.bullets.forEach((item) => {
      parts.push(`<li>${escapeGuideText(item)}</li>`);
    });
    parts.push('</ul>');
  }
  if (section.table) {
    parts.push('<div class="table-container"><table class="data-table guide-table"><thead><tr>');
    section.table.headers.forEach((h) => {
      parts.push(`<th>${escapeGuideText(h)}</th>`);
    });
    parts.push('</tr></thead><tbody>');
    section.table.rows.forEach((row) => {
      parts.push('<tr>');
      row.forEach((cell) => {
        parts.push(`<td>${escapeGuideText(cell)}</td>`);
      });
      parts.push('</tr>');
    });
    parts.push('</tbody></table></div>');
  }
  return parts.join('');
}

function renderTodoGuide(id) {
  const nav = document.getElementById('guideNav');
  const article = document.getElementById('guideArticle');
  if (!nav || !article) return;

  const activeId = GUIDE_PAGES[id] ? id : GUIDE_ORDER[0];
  const page = GUIDE_PAGES[activeId];

  nav.innerHTML =
    '<p class="guide-nav-title">Build topics</p><ul>' +
    GUIDE_ORDER.map((topicId) => {
      const topic = GUIDE_PAGES[topicId];
      if (!topic) return '';
      const current = topicId === activeId ? ' class="active"' : '';
      return `<li><a${current} href="todo-guide.html?id=${encodeURIComponent(topicId)}">${escapeGuideText(topic.title)}</a></li>`;
    }).join('') +
    '</ul>';

  const idx = GUIDE_ORDER.indexOf(activeId);
  const prev = idx > 0 ? GUIDE_PAGES[GUIDE_ORDER[idx - 1]] : null;
  const next = idx < GUIDE_ORDER.length - 1 ? GUIDE_PAGES[GUIDE_ORDER[idx + 1]] : null;
  const prevId = idx > 0 ? GUIDE_ORDER[idx - 1] : '';
  const nextId = idx < GUIDE_ORDER.length - 1 ? GUIDE_ORDER[idx + 1] : '';

  const sourceHtml = (page.sources || [])
    .map((key) => OMNISSA_LINKS[key])
    .filter(Boolean)
    .map((src) => `<li><a href="${escapeGuideText(src.url)}" target="_blank" rel="noopener">${escapeGuideText(src.label)}</a></li>`)
    .join('');

  article.innerHTML = [
    `<p class="guide-kicker">Omnissa Horizon 8 blueprint</p>`,
    `<h1>${escapeGuideText(page.title)}</h1>`,
    `<p class="guide-summary">${escapeGuideText(page.summary)}</p>`,
    `<div class="guide-callout">Figures below follow the Omnissa Workspace ONE and Horizon Reference Architecture (Horizon 8 architecture, UAG, and network-ports guides). Confirm current configuration maximums before sign-off — published limits can change by release.</div>`,
    (page.sections || []).map(renderSection).join(''),
    '<h2>Official sources</h2>',
    `<ul class="guide-sources">${sourceHtml}</ul>`,
    '<div class="guide-pager">',
    prev
      ? `<a class="btn btn-secondary" href="todo-guide.html?id=${encodeURIComponent(prevId)}">← ${escapeGuideText(prev.title)}</a>`
      : '<span></span>',
    next
      ? `<a class="btn btn-secondary" href="todo-guide.html?id=${encodeURIComponent(nextId)}">${escapeGuideText(next.title)} →</a>`
      : '<span></span>',
    '</div>'
  ].join('');

  document.title = `${page.title} — Horizon Design Guide`;
  article.scrollIntoView({ block: 'start' });
}
