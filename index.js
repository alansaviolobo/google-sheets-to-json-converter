/**
 * This script will convert data from an exportable google sheet into a geojson file.
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import fetch from 'node-fetch';
import { fileURLToPath, pathToFileURL } from 'url';

const CACHE_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data/');
const LOG_FILE = path.join(CACHE_DIRECTORY, 'debug-log.txt');
const GOOGLESHEETURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQAjIaxmEf4dv9eGjASL9YSlVGJLsmvfggZpGApiUP4YD6uexFG4otpwy0wQAWUFW4De4Pz4QKy79yV/pub?single=true&output=csv&gid=";

function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${message}\n`;
    if (data) {
        logMessage += (typeof data === 'string' ? data : JSON.stringify(data, null, 2)) + '\n';
    }

    console.log(logMessage);
    fs.appendFileSync(LOG_FILE, logMessage);
}

function convertAssociativeArrayToGeoJSON(dataArray, latKey, lngKey, layer_name, propertiesToInclude = []) {
    const geojsonFeatures = dataArray.map(item => {
        // Extract latitude and longitude
        const latitude = parseFloat(item[latKey]);
        const longitude = parseFloat(item[lngKey]);

        // Create properties object, including only specified keys or all keys except lat/lng
        const properties = {};
        if (propertiesToInclude.length > 0) {
            propertiesToInclude.forEach(key => {
                if (item.hasOwnProperty(key)) {
                    properties[key] = item[key];
                }
            });
        } else {
            // Include all properties except lat and lng keys
            for (const key in item) {
                if (item.hasOwnProperty(key) && key !== latKey && key !== lngKey && !key.startsWith('-')) {
                    properties[key] = item[key];
                }
            }
        }

        return {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [longitude, latitude] // GeoJSON coordinates are [longitude, latitude]
            },
            properties: properties
        };
    }).filter(feature => feature !== null); // Filter out any null features from invalid data

    return {
        type: "FeatureCollection",
        name: layer_name,
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: geojsonFeatures
    };
}

async function fetchAndCacheData(dataset, url) {
    const response = await fetch(url);
    const csv = await response.text();

    const array = Papa.parse(csv, { header: true, dynamicTyping: true }).data;
    const geojson = convertAssociativeArrayToGeoJSON(array, 'Latitude', 'Longitude', dataset.toLowerCase().replace(' ', '-'));

    fs.writeFileSync(CACHE_DIRECTORY + dataset.replace(/\s/g, '-') + '.csv', csv);
    fs.writeFileSync(CACHE_DIRECTORY + dataset.replace(/\s/g, '-') + '.geojson', JSON.stringify(geojson, null, 2));
    fs.writeFileSync(CACHE_DIRECTORY + dataset.replace(/\s/g, '-') + '.min.geojson', JSON.stringify(geojson, null, 0));
}

function verifyCleanData(filename) {
    const data = fs.readFileSync(filename, 'utf8');
    if (data.includes('#REF!')) {
        return `#REF! found in ${filename}`;
    }
    if (data.includes('Loading')) {
        return `Loading... found in ${filename}`;
    }
}

// Make sure the cache directory exists
if (!fs.existsSync(CACHE_DIRECTORY)) {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
}
fs.writeFileSync(LOG_FILE, '');
debugLog('Debug logging initialized');

// Run only if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    (async () => {
        try {
            let dataSets = {
                "0": "Fire Stations",
                "867350358": "Police Stations",
                "396287298": "Civil Supplies Godowns",
                "2107086279": "Ambulances",
                "410764449": "Apada Mitras",
                "973534772": "Apada Sakhis",
                "1309860234": "Cyclone Shelters",
                "36114476": "Dam Levels",
                "302060060": "Fire Appliances",
                "392979524": "Heavy Machinery",
                "495904604": "Hospitals",
                "236724982": "MHA Units",
                "1768104908": "Mutual Aid Agencies",
                "443003227": "Panchayats",
                "1689409318": "River Gauges",
                "1786282296": "Schools",
                "1929576986": "Tree Cutters",
                "920360157": "Water Resources",
                "0": "Capacity Building",
                "0": "High Density Spaces",
                "0": "Boats",
            };

            for (const key of Object.keys(dataSets)) {
                await fetchAndCacheData(dataSets[key], GOOGLESHEETURL + key);
                debugLog(`Finished generating ${dataSets[key]}`);
            }
            debugLog('File Caching finished');

            const errors = [];
            for (const key of Object.keys(dataSets)) {
                errors.push(verifyCleanData(CACHE_DIRECTORY + dataSets[key].replace(/\s/g, '-') + '.csv'));
                debugLog(`Finished checking ${dataSets[key]}`);
            }
            debugLog('File Checking finished');

        } catch (error) {
            debugLog(`ERROR: ${error.message}`, error.stack);
            console.error('Error:', error);
            process.exit(1);
        }
    })();
}
