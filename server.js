const express = require('express');
const xml2js = require('xml2js');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const port = 5000;

const xmlParser = new xml2js.Parser();

async function parseSolarXml() {
    const xmlUrl = 'https://www.hamqsl.com/solarxml.php';
    try {
        const response = await fetch(xmlUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const xmlData = await response.text();

        const result = await new Promise((resolve, reject) => {
            xmlParser.parseString(xmlData, (err, parsedData) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(parsedData);
                }
            });
        });

        const solardata = result.solar.solardata[0];
        const parsedJson = {
            source: solardata.source[0]._,
            updated: solardata.updated[0],
            solarflux: parseInt(solardata.solarflux[0], 10),
            aindex: parseInt(solardata.aindex[0], 10),
            kindex: parseInt(solardata.kindex[0], 10),
            kindexnt: solardata.kindexnt[0],
            xray: solardata.xray[0],
            sunspots: parseInt(solardata.sunspots[0], 10),
            heliumline: parseFloat(solardata.heliumline[0]),
            protonflux: parseInt(solardata.protonflux[0], 10),
            electonflux: parseInt(solardata.electonflux[0], 10),
            aurora: parseInt(solardata.aurora[0], 10),
            normalization: parseFloat(solardata.normalization[0]),
            latdegree: parseFloat(solardata.latdegree[0]),
            solarwind: parseFloat(solardata.solarwind[0]),
            magneticfield: parseFloat(solardata.magneticfield[0]),
            geomagfield: solardata.geomagfield[0],
            signalnoise: solardata.signalnoise[0],
            muf: solardata.muf[0],
            calculatedconditions: solardata.calculatedconditions[0].band.reduce(
                (acc, { _, $: { name, time } }) => {
                    acc[name] = acc[name] || {};
                    acc[name][time] = _;
                    return acc;
                    }, {}
                ),
           calculatedvhfconditions: solardata.calculatedvhfconditions[0].phenomenon.reduce(
                (acc, { _, $: { name, location } }) => {
                    acc[name] = acc[name] || {};
                    acc[name][location] = _;
                    return acc;
                }, {}
           ),
        };

        return parsedJson;
    } catch (error) {
        console.error('Error fetching or parsing XML:', error);
        throw error;
    }
}

// Render json data onto a canvas
async function renderSolarCanvas(data) {
    const width = 800;
    const height = 480;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    // Set background color
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    // Set font styles
    context.font = '24px Courier New';
    context.fillStyle = '#ffffff';

    // Draw header
    context.font = 'bold 24px Courier New';
    context.fillText('Solar Terrestrial Data — ' + new Date().toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' }), 20, 40);
    context.font = '24px Courier New'; // Reset font

    // Draw separator line
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(20, 60);
    context.lineTo(width - 20, 60);
    context.stroke();

    // Draw data rows
    context.fillText(`SFI: ${data.solarflux}   Sunspots: ${data.sunspots}   X-Ray: ${data.xray}   Aurora: ${data.aurora}`, 20, 90);
    context.fillText(`Solar Wind: ${data.solarwind} km/s  Kp: ${data.kindex}   Bz: ${data.magneticfield} nT `, 20, 120);
    context.fillText(`Proton Flux: ${data.protonflux}  Geomagnetic Field: ${data.geomagfield}`, 20, 150);
    context.fillText(`Noise: ${data.signalnoise}`, 20, 180);

    // Draw separator line
    context.beginPath();
    context.moveTo(20, 200);
    context.lineTo(width - 20, 200);
    context.stroke();

    // Draw HF Band Conditions    
    context.fillText('HF Band Conditions', 20, 230);
    context.fillText('Band     Day    Night', 20, 265);
    let linePos = 300
    Object.entries(data.calculatedconditions).forEach(([key, value]) => {
        context.fillText(`${key}: ${value['day'] || 'N/A'}   ${value['night'] || 'N/A'}`, 20, linePos);
        linePos += 35;
    });
    
    // Draw VHF / EME Conditions
    context.fillText('VHF / EME Conditions', width / 2 + 50, 230);
    context.fillText('Aurora:  ' + (data.calculatedvhfconditions?.['vhf-aurora']?.['northern_hemi'] || 'N/A'), width / 2 + 50, 265);
    context.fillText('6m EsEU: ' + (data.calculatedvhfconditions?.['E-Skip']?.['europe_6m'] || 'N/A'), width / 2 + 50, 300);
    context.fillText('4m EsEU: ' + (data.calculatedvhfconditions?.['E-Skip']?.['europe_4m']  || 'N/A'), width / 2 + 50, 335);
    context.fillText('2m EsEU: ' + (data.calculatedvhfconditions?.['E-Skip']?.['europe']  || 'N/A'), width / 2 + 50, 370);
    context.fillText('2m EsNA: ' + (data.calculatedvhfconditions?.['E-Skip']?.['north_america']  || 'N/A'), width / 2 + 50, 405);

    return canvas.toBuffer('image/png');
}

// JSON data endpoint
app.get('/solar/json', async (req, res) => {
    try {
        const solarData = await parseSolarXml();
        res.json(solarData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve or parse solar data' });
    }
});

// Render canvas endpoint
app.get('/solar/canvas', async (req, res) => {
    try {
        const solarData = await parseSolarXml();
        const canvasImageBuffer = await renderSolarCanvas(solarData);

        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Solar Terrestrial Data</title>
                <style>
                    body { background-color: #282c34; color: #ffffff; font-family: Courier New, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    img { border: 2px solid #ffffff; }
                </style>
            </head>
            <body>
                <img src="data:image/png;base64,${canvasImageBuffer.toString('base64')}" alt="Solar Terrestrial Data Canvas">
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error generating canvas:', error);
        res.status(500).send('Error generating solar data canvas.');
    }
});

// Direct PNG endpoint
app.get('/solar/png', async (req, res) => {
    try {
        const solarData = await parseSolarXml();
        const canvasImageBuffer = await renderSolarCanvas(solarData);
        res.setHeader('Content-Type', 'image/png');
        res.send(canvasImageBuffer);
    } catch (error) {
        console.error('Error generating PNG:', error);
        res.status(500).send('Error generating solar data PNG.');
    }
});

app.get('/', (req, res) => {
    res.redirect('/solar/canvas');
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});