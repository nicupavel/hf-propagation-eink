const express = require('express');
const xml2js = require('xml2js');
const { createCanvas, loadImage } = require('canvas');

const app = express();
const port = 3000;
const xmlParser = new xml2js.Parser();

const defaultSettings = {
    mode: 1,
    invert: 0,
    width: 800,
    height: 480,
    fontSizeSmall: 18,
    fontSizeNormal: 20,
    fontSizeLarge: 20,
};

const settings = { ...defaultSettings };

app.use((req, res, next) => {
    const { mode, invert, width, height } = req.query;

    // Set default values if not provided
    settings.mode = mode === '0' || mode === '1' ? parseInt(mode) : defaultSettings.mode;
    settings.invert = invert === '0' || invert === '1' ? parseInt(invert) : defaultSettings.invert;
    settings.width = parseInt(width ?? defaultSettings.width);
    settings.height = parseInt(height ?? defaultSettings.height);

    next();
});

const cacheInterval = 5 * 60 * 1000;
let lastFetch = 0;
let lastData = null;

async function getSolarXml() {
    const xmlUrl = 'https://www.hamqsl.com/solarxml.php';

    if (lastData == null || Date.now() - lastFetch > cacheInterval) {
        try {
            const response = await fetch(xmlUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const xmlData = await response.text();
            console.log(`Refreshed data from ${xmlUrl} `);
            lastData = xmlData;
            lastFetch = Date.now();
        } catch(error) {
            console.error('Error parsing XML:', error);
            throw error;
        }
    }

    return lastData;
}

async function parseSolarXml() {
    try {        
        const xmlData = await getSolarXml();

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
            fof2: solardata.fof2[0],
            muf: solardata.muf[0],
            muffactor: solardata.muffactor[0],
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
        console.error('Error parsing XML:', error);
        throw error;
    }
}

// Render json data onto a canvas
async function renderSolarCanvas(data) { // mode is now expected to be parsed from query params
    const canvas = createCanvas(settings.width, settings.height);
    const context = canvas.getContext('2d');

    // Define colors
    const theme = {
        normal: {
            background: '#000000',
            title: '#cccccc',
            subtitle: '#aaaaaa',
            text: '#ffffff',
            separator: '#555555',
            good: '#00ff00',
            fair: '#ffff00',
            poor: '#ff0000'
        },
        invert: {
            background: '#ffffff',
            title: '#555',
            subtitle: '#666',
            text: '#000000',
            separator: '#555555',
            good: '#00ff00',
            fair: '#ffff00',
            poor: '#ff0000'
        }        
    };

    const colors = settings.invert ? theme.invert : theme.normal;
    settings.fontSizeSmall = (defaultSettings.fontSizeSmall * settings.height) / defaultSettings.height;
    settings.fontSizeNormal = (defaultSettings.fontSizeNormal * settings.height) / defaultSettings.height;
    settings.fontSizeLarge = (defaultSettings.fontSizeLarge * settings.height) / defaultSettings.height;

    const setConditionColor = (condition) => {
        if (settings.mode == 0 ) return colors.text;

        if (condition.toLowerCase().includes('good')) return colors.good;
        if (condition.toLowerCase().includes('mid lat aur')) return colors.good;
        if (condition.toLowerCase().includes('fair')) return colors.fair;
        if (condition.toLowerCase().includes('poor')) return colors.poor;
        if (condition.toLowerCase().includes('closed')) return colors.poor;
         return colors.text;
    };

    // Set background color
    context.fillStyle = colors.background;
    context.fillRect(0, 0, settings.width, settings.height);

    // Set font styles
    context.font = `${settings.fontSizeNormal}px Courier New`;
    context.fillStyle = colors.text;

    // Draw header
    context.font = `bold ${settings.fontSizeLarge}px Courier New`;
    context.fillStyle = colors.title;
    context.fillText('Solar Terrestrial Data', 20, 40);

    // Draw subtitle
    context.font = '${settings.fontSizeSmall}px Courier New';
    context.fillStyle = colors.subtitle;
    context.fillText(new Date().toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' }), 20, 70);

    // Draw separator line
    context.strokeStyle = colors.separator;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(20, 85);
    context.lineTo(settings.width - 20, 85);
    context.stroke();

    // Draw data rows in three columns
    context.font = '${settings.fontSizeNormal}px Courier New';

    const col1X = 20;
    const col2X = 210;
    const col3X = 500;

    let yPos = 125;
    
    context.fillStyle = colors.subtitle;
    context.fillText(`SFI:`, col1X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.solarflux}`, col1X + 60, yPos);
    
    context.fillStyle = colors.subtitle;
    context.fillText(`Sunspots:`, col2X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.sunspots}`, col2X + 120, yPos);

    context.fillStyle = colors.subtitle;
    context.fillText(`Sig Noise:`, col3X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.signalnoise}`, col3X + 130, yPos);
    
    yPos += 30;
    context.fillStyle = colors.subtitle;
    context.fillText(`K Index:`, col1X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.kindex}`, col1X + 100, yPos);
    
    context.fillStyle = colors.subtitle;
    context.fillText(`Solar Wind:`, col2X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.solarwind} km/s`, col2X + 140, yPos);

    context.fillStyle = colors.subtitle;
    context.fillText(`X-Ray:`, col3X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.xray}`, col3X + 80, yPos);

    yPos += 30;
    context.fillStyle = colors.subtitle;
    context.fillText(`Aurora:`, col1X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.aurora}`, col1X + 100, yPos);

    context.fillStyle = colors.subtitle;
    context.fillText(`Proton Flux:`, col2X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.protonflux}`, col2X + 160, yPos);

    context.fillStyle = colors.subtitle;
    context.fillText(`Helium Line:`, col3X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.heliumline}`, col3X + 150, yPos);
    
    yPos += 30;
    context.fillStyle = colors.subtitle;
    context.fillText(`Mag Fld:`, col1X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.magneticfield}`, col1X + 100, yPos);

    context.fillStyle = colors.subtitle;
    context.fillText(`Geo Fld:`, col2X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.geomagfield}`, col2X + 110, yPos);

    context.fillStyle = colors.subtitle;
    context.fillText(`Lat Deg:`, col3X, yPos);
    context.fillStyle = colors.text;
    context.fillText(`${data.latdegree}`, col3X + 100, yPos);


    // Draw separator line
    context.beginPath();
    context.moveTo(20, yPos + 25);
    context.lineTo(settings.width - 20, yPos + 25);
    context.stroke();


    yPos += 70;
    // Draw HF Band Conditions
    context.font = 'bold ${settings.fontSizeLarge}px Courier New';
    context.fillStyle = colors.title;
    context.fillText('HF Band Conditions', 20, yPos);

    context.font = '${settings.fontSizeNormal}px Courier New';
    context.fillStyle = colors.subtitle;
    context.fillText('Band     Day   Night', 20, yPos + 30);

    yPos += 60;
    Object.entries(data.calculatedconditions).forEach(([key, value]) => {
        const dayCondition = value['day'] || 'N/A';
        const nightCondition = value['night'] || 'N/A';
        
        context.fillStyle = colors.subtitle;
        context.fillText(`${key}:`, 20, yPos);
        
        context.fillStyle = setConditionColor(dayCondition);
        context.fillText(dayCondition, 126, yPos);
        
        context.fillStyle = setConditionColor(nightCondition);
        context.fillText(nightCondition, 198, yPos);

        yPos += 35;
    });

    let vhfXPos = settings.width / 2 - 100;
    let vhfYPos = 285;
    // Draw VHF / EME Conditions
    context.font = 'bold ${settings.fontSizeLarge}px Courier New';
    context.fillStyle = colors.title;
    context.fillText('VHF / EME Conditions', vhfXPos, vhfYPos);
    
    context.font = '${settings.fontSizeNormal}px Courier New';
    vhfYPos += 30;

    const vhfConditions = [
        { 'Aurora':  data.calculatedvhfconditions?.['vhf-aurora']?.['northern_hemi'] || 'N/A' },
        { '6m EsEU': data.calculatedvhfconditions?.['E-Skip']?.['europe_6m'] || 'N/A' },
        { '4m EsEU': data.calculatedvhfconditions?.['E-Skip']?.['europe_4m']  || 'N/A'},
        { '2m EsEU': data.calculatedvhfconditions?.['E-Skip']?.['europe']  || 'N/A' },
        { '2m EsNA': data.calculatedvhfconditions?.['E-Skip']?.['north_america']  || 'N/A' },
    ];

    vhfConditions.forEach(condition => {
        const [[label, value]] = Object.entries(condition);
        context.fillStyle = colors.subtitle;
        context.fillText(label + ':', vhfXPos, vhfYPos);

        context.fillStyle = setConditionColor(value);
        context.fillText(value.trim(), vhfXPos + 120, vhfYPos);
        vhfYPos += 34;
    });

    let LasthfXPos = settings.width / 2 + 180;
    let LasthfYPos = 285;

    function drawSegment(ctx, text, color, x, y) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    const width = ctx.measureText(text).width;
    return x + width;
}

    const LINE_HEIGHT = 30;

    // Set the initial positions
    let currentXPos = LasthfXPos;
    let currentYPos = LasthfYPos;

    // --- LINE 1: MUF ---
    currentXPos = drawSegment(context, 'MUF: ', colors.subtitle, currentXPos, currentYPos);
    currentXPos = drawSegment(context, `${data.muf}`, colors.text, currentXPos, currentYPos);

    // --- START NEW LINE ---
    currentXPos = LasthfXPos;
    currentYPos += LINE_HEIGHT; 

    // --- LINE 2: Norm ---
    currentXPos = drawSegment(context, 'Norm: ', colors.subtitle, currentXPos, currentYPos);
    currentXPos = drawSegment(context, `${data.normalization}`, colors.text, currentXPos, currentYPos);

    // --- START NEW LINE ---
    currentXPos = LasthfXPos;
    currentYPos += LINE_HEIGHT; 

    // --- LINE 3: A Index ---
    currentXPos = drawSegment(context, 'A Index: ', colors.subtitle, currentXPos, currentYPos);
    currentXPos = drawSegment(context, `${data.aindex}`, colors.text, currentXPos, currentYPos);

    // --- START NEW LINE ---
    currentXPos = LasthfXPos;
    currentYPos += LINE_HEIGHT; 

    // --- LINE 4: Elec Flx ---
    currentXPos = drawSegment(context, 'Elec Flx: ', colors.subtitle, currentXPos, currentYPos);
    currentXPos = drawSegment(context, `${data.electonflux}`, colors.text, currentXPos, currentYPos);

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
