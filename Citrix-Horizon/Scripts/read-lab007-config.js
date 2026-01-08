#!/usr/bin/env node

// read-lab007-config.js
// Node.js script to read the LAB007 Tools configuration from JSON file

const fs = require('fs');
const path = require('path');

function readLAB007Config(configPath) {
    const defaultConfigPath = path.join(__dirname, '..', 'LAB007-Config.JSON');
    const finalPath = configPath || defaultConfigPath;

    try {
        if (!fs.existsSync(finalPath)) {
            console.warn(`Configuration file not found at: ${finalPath}`);
            console.warn('Using default configuration...');

            // Return default configuration
            return {
                citrixVersion: "1912",
                ddcName: "localhost",
                usageDays: 30,
                vCenterServer: "",
                masterImagePrefix: "SHC-M-",
                runPreReqCheck: true,
                auditComponents: {
                    SiteInfo: true,
                    Applications: true,
                    Desktops: true,
                    Catalogs: true,
                    DeliveryGroups: true,
                    UsageStats: true,
                    Policies: true,
                    Roles: true,
                    VMwareSpecs: false,
                    Servers: true,
                    DirectorOData: true
                }
            };
        }

        const configJson = fs.readFileSync(finalPath, 'utf8');
        const config = JSON.parse(configJson);
        console.log(`Configuration loaded successfully from: ${finalPath}`);
        return config;

    } catch (error) {
        console.error('Failed to read or parse configuration file:', error.message);
        return null;
    }
}

// Export the function
module.exports = { readLAB007Config };

// If run directly from command line
if (require.main === module) {
    const configPath = process.argv[2]; // Optional command line argument
    const config = readLAB007Config(configPath);

    if (config) {
        console.log('Configuration loaded:');
        console.log(JSON.stringify(config, null, 2));
    } else {
        process.exit(1);
    }
}