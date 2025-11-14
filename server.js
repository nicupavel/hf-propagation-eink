const express = require('express');
const xml2js = require('xml2js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = 3000;
const xmlParser = new xml2js.Parser();

// --- GLOBAL CONSTANT FIX ---
const FONT_FAMILY = 'Ubuntu Mono';
// ---------------------------

// --- REGISTER CUSTOM FONT ---
// Ensure you have an 'assets' folder in your project root with 'UbuntuMono-Bold.ttf'
try {
    const fontPath = path.join(__dirname, 'assets', 'UbuntuMono-Bold.ttf');
    registerFont(fontPath, { family: FONT_FAMILY });
    console.log(`Registered font: ${FONT_FAMILY}`);
} catch (error) {
    // Fallback to a system monospace font if registration fails
    console.warn("Could not register Ubuntu Mono font. Falling back to monospace.");
    console.error(error.message);
}
// ----------------------------

const defaultSettings = {
    mode: 1,
    invert: 0,
    width: 800,
    height: 480,
    fontSizeSmall: 20,
    fontSizeNormal: 22,
    fontSizeLarge: 22,
    LINE_SPACING_DEFAULT: 30,
    bw_mode: 0, // NEW: Black and White mode flag
};

const settings = { ...defaultSettings };

app.use((req, res, next) => {
    const { mode, invert, width, height, bw_mode } = req.query; // Capture bw_mode

    // Set default values if not provided
    settings.mode = mode === '0' || mode === '1' ? parseInt(mode) : defaultSettings.mode;
    settings.invert = invert === '0' || invert === '1' ? parseInt(invert) : defaultSettings.invert;
    settings.width = parseInt(width ?? defaultSettings.width);
    settings.height = parseInt(height ?? defaultSettings.height);
    // NEW: Parse bw_mode
    settings.bw_mode = bw_mode === '1' ? 1 : defaultSettings.bw_mode;

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
            console.error('Error fetching XML:', error);
            if (lastData === null) {
                throw error;
            }
            console.log('Using stale data due to fetch error.');
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
        
        const safeParse = (arr, type = 'string') => {
            if (!arr || arr.length === 0) return 'N/A';
            const val = arr[0];
            if (type === 'int') return parseInt(val, 10);
            if (type === 'float') return parseFloat(val);
            return val;
        };

        const parsedJson = {
            source: safeParse(solardata.source),
            updated: safeParse(solardata.updated),
            solarflux: safeParse(solardata.solarflux, 'int'),
            aindex: safeParse(solardata.aindex, 'int'),
            kindex: safeParse(solardata.kindex, 'int'),
            kindexnt: safeParse(solardata.kindexnt),
            xray: safeParse(solardata.xray),
            sunspots: safeParse(solardata.sunspots, 'int'),
            heliumline: safeParse(solardata.heliumline, 'float'),
            protonflux: safeParse(solardata.protonflux, 'int'),
            electonflux: safeParse(solardata.electonflux, 'int'),
            aurora: safeParse(solardata.aurora, 'int'),
            normalization: safeParse(solardata.normalization, 'float'),
            latdegree: safeParse(solardata.latdegree, 'float'),
            solarwind: safeParse(solardata.solarwind, 'float'),
            magneticfield: safeParse(solardata.magneticfield, 'float'),
            geomagfield: safeParse(solardata.geomagfield),
            signalnoise: safeParse(solardata.signalnoise),
            fof2: safeParse(solardata.fof2),
            muf: safeParse(solardata.muf),
            muffactor: safeParse(solardata.muffactor),
            calculatedconditions: solardata.calculatedconditions?.[0]?.band?.reduce(
                (acc, { _, $: { name, time } }) => {
                    acc[name] = acc[name] || {};
                    acc[name][time] = _;
                    return acc;
                    }, {}
                ) || {},
           calculatedvhfconditions: solardata.calculatedvhfconditions?.[0]?.phenomenon?.reduce(
                (acc, { _, $: { name, location } }) => {
                    acc[name] = acc[name] || {};
                    acc[name][location] = _;
                    return acc;
                }, {}
           ) || {},
        };
        return parsedJson;
    } catch (error) {
        console.error('Error parsing XML:', error);
        throw error;
    }
}


async function renderSolarCanvas(data) {
    const canvas = createCanvas(settings.width, settings.height);
    const context = canvas.getContext('2d');
    
    // Define colors
    const theme = {
        normal: {
            background: '#000000', title: '#cccccc', subtitle: '#aaaaaa', text: '#ffffff', separator: '#555555',
            good: '#00ff00', green: '#00ff00', fair: '#FFA500', poor: '#ff0000'
        },
        invert: {
            background: '#ffffff', title: '#555', subtitle: '#666', text: '#000000', separator: '#555555',
            good: '#00ff00', green: '#000000', fair: '#FFA500', poor: '#ff0000'
        },
        // NEW: Pure Black & White (B/W) theme definition
        bw: {
            background: '#ffffff', title: '#000000', subtitle: '#333333', text: '#000000', separator: '#bbbbbb',
            good: '#000000', green: '#000000', fair: '#000000', poor: '#000000'
        }        
    };

    // Choose the color scheme based on settings
    const colors = settings.bw_mode === 1 ? theme.bw : (settings.invert ? theme.invert : theme.normal);
    
    const SCALE_FACTOR = settings.height / defaultSettings.height;
    
    settings.fontSizeSmall = Math.round(defaultSettings.fontSizeSmall * SCALE_FACTOR);
    settings.fontSizeNormal = Math.round(defaultSettings.fontSizeNormal * SCALE_FACTOR);
    settings.fontSizeLarge = Math.round(defaultSettings.fontSizeLarge * SCALE_FACTOR);
    
    const LINE_SPACING = Math.round(defaultSettings.LINE_SPACING_DEFAULT * SCALE_FACTOR);

    // --- Helper Functions for Drawing ---
    
    function drawSegment(ctx, text, color, x, y) {
        ctx.fillStyle = color;
        ctx.fillText(text, Math.round(x), Math.round(y));
        const width = ctx.measureText(text).width;
        return x + width;
    }

    const setConditionColor = (condition) => {
        if (settings.bw_mode === 1) return colors.text; // Text is black in B/W mode
        
        if (settings.mode == 0 ) return colors.text;

        if (condition.toLowerCase().includes('good')) return colors.good;
        if (condition.toLowerCase().includes('mid lat aur')) return colors.good;
        if (condition.toLowerCase().includes('fair')) return colors.fair;
        if (condition.toLowerCase().includes('poor')) return colors.poor;
        if (condition.toLowerCase().includes('closed')) return colors.poor;
         return colors.text;
    };

    function drawRightAlignedText(text, xColStart, y, width, ctx) {
        const textWidth = ctx.measureText(text).width;
        ctx.fillText(text, Math.round(xColStart + width - textWidth), Math.round(y));
    }
    
    function drawConditionCell(condition, xColStart, y, width, ctx, currentSettings, currentColors, setCondColor, hColor, hTextColor) {
        const rectHeight = currentSettings.fontSizeNormal + Math.round(5 * SCALE_FACTOR); 
        const paddingX = Math.round(4 * SCALE_FACTOR);
        
        const textWidth = ctx.measureText(condition).width;
        
        const actualTextStartX = xColStart + width - textWidth; 
        
        if (condition.toLowerCase().includes('good')) {
            
            let conditionHighlightColor;
            let conditionHighlightTextColor;

            if (currentSettings.bw_mode === 1) {
                // B/W Mode: Highlight is Black, Text is White
                conditionHighlightColor = '#000000';
                conditionHighlightTextColor = '#ffffff';
            } else {
                // Standard Mode (Previous Logic): Highlight is Gray for mode=0, Green for mode=1
                conditionHighlightColor = currentSettings.mode === 0 ? '#555555' : currentColors.good;
                conditionHighlightTextColor = hTextColor; // Use inherited logic
            }
            
            ctx.fillStyle = conditionHighlightColor; 
            
            // Vertical alignment fix
            const rectYStart = y - currentSettings.fontSizeNormal + Math.round(2 * SCALE_FACTOR);
            
            ctx.fillRect(
                Math.round(actualTextStartX - paddingX),
                Math.round(rectYStart),
                Math.round(textWidth + 2 * paddingX),
                Math.round(rectHeight)
            ); 
            
            ctx.fillStyle = conditionHighlightTextColor; 
        } else {
            ctx.fillStyle = setCondColor(condition);
        }
        
        drawRightAlignedText(condition, xColStart, y, width, ctx);
    }
    // --- End Helper Functions ---

    // --- Highlight logic for the Top Data Blocks ---
    let effectiveHighlightColor;
    let effectiveHighlightTextColor;

    if (settings.bw_mode === 1) {
        effectiveHighlightColor = '#000000';
        effectiveHighlightTextColor = '#ffffff';
    } else {
        effectiveHighlightColor = settings.mode === 0 ? '#555555' : colors.green;
        // Text is pure white if mode=0, or canvas background color for contrast if mode=1
        effectiveHighlightTextColor = settings.mode === 0 ? '#ffffff' : colors.background;
    }

    const highlightColor = effectiveHighlightColor;
    const highlightTextColor = effectiveHighlightTextColor;


    // Set background color
    context.fillStyle = colors.background;
    context.fillRect(0, 0, settings.width, settings.height);

    // Set font styles
    context.font = `${settings.fontSizeNormal}px ${FONT_FAMILY}`; // Use custom font
    context.fillStyle = colors.text;
    
    // --- Scale Initial X and Y positions ---
    const BASE_PADDING = Math.round(20 * SCALE_FACTOR);
    
    // Draw header (X: 20, Y: 40)
    context.font = `bold ${settings.fontSizeLarge}px ${FONT_FAMILY}`; // Use custom font
    context.fillStyle = colors.title;
    context.fillText('Solar Terrestrial Data', BASE_PADDING, Math.round(40 * SCALE_FACTOR));

    // Draw subtitle (X: 20, Y: 70)
    context.font = `bold ${settings.fontSizeSmall}px ${FONT_FAMILY}`; // Use custom font
    context.fillStyle = colors.subtitle;
    context.fillText(new Date().toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' }), BASE_PADDING, Math.round(70 * SCALE_FACTOR));

    // Draw separator line (Y: 85)
    context.strokeStyle = colors.separator;
    context.lineWidth = Math.round(2 * SCALE_FACTOR);
    context.beginPath();
    context.moveTo(BASE_PADDING, Math.round(85 * SCALE_FACTOR));
    context.lineTo(settings.width - BASE_PADDING, Math.round(85 * SCALE_FACTOR));
    context.stroke();

    // Draw data rows in three columns (Top half)
    context.font = `bold ${settings.fontSizeNormal}px ${FONT_FAMILY}`; // Use custom font

    // Scale X positions of columns
    const col1X = BASE_PADDING;
    const col2X = Math.round(210 * SCALE_FACTOR);
    const col3X = Math.round(500 * SCALE_FACTOR);

    // Scale initial yPos
    let yPos = Math.round(125 * SCALE_FACTOR);
    
    // --- Row 1: SFI, Sunspots, S/N Ratio (Custom Highlight Logic) ---
    const SFI_OFFSET = Math.round(60 * SCALE_FACTOR);
    const SUNSPOTS_OFFSET = Math.round(120 * SCALE_FACTOR);
    const SNR_OFFSET = Math.round(130 * SCALE_FACTOR);
    const RECT_HEIGHT_BASE = settings.fontSizeNormal + Math.round(5 * SCALE_FACTOR);
    const RECT_Y_START_ROW1 = yPos - settings.fontSizeNormal + Math.round(5 * SCALE_FACTOR) - Math.round(4 * SCALE_FACTOR);
    
    // SFI
    context.fillStyle = colors.subtitle;
    context.fillText(`SFI:`, col1X, yPos);
    
    let textWidth = context.measureText(`${data.solarflux}`).width;
    let textX = col1X + SFI_OFFSET - 10;
    
    context.fillStyle = highlightColor;
    context.fillRect(Math.round(textX - 4 * SCALE_FACTOR), Math.round(RECT_Y_START_ROW1), Math.round(textWidth + 8 * SCALE_FACTOR), Math.round(RECT_HEIGHT_BASE));
    context.fillStyle = highlightTextColor;
    context.fillText(`${data.solarflux}`, Math.round(textX), yPos);
    
    // Sunspots
    context.fillStyle = colors.subtitle;
    context.fillText(`Sunspots:`, col2X, yPos);

    textWidth = context.measureText(`${data.sunspots}`).width;
    textX = col2X + SUNSPOTS_OFFSET - 10;
    
    context.fillStyle = highlightColor;
    context.fillRect(Math.round(textX - 4 * SCALE_FACTOR), Math.round(RECT_Y_START_ROW1), Math.round(textWidth + 8 * SCALE_FACTOR), Math.round(RECT_HEIGHT_BASE));
    context.fillStyle = highlightTextColor;
    context.fillText(`${data.sunspots}`, Math.round(textX), yPos);

    // Signal Noise
    context.fillStyle = colors.subtitle;
    context.fillText(`S/N Ratio:`, col3X, yPos);

    textWidth = context.measureText(`${data.signalnoise}`).width;
    textX = col3X + SNR_OFFSET - 10;
    
    context.fillStyle = highlightColor;
    context.fillRect(Math.round(textX - 4 * SCALE_FACTOR), Math.round(RECT_Y_START_ROW1), Math.round(textWidth + 8 * SCALE_FACTOR), Math.round(RECT_HEIGHT_BASE));
    context.fillStyle = highlightTextColor;
    context.fillText(`${data.signalnoise}`, Math.round(textX), yPos);
    
    // --- Declarative Data for Rows 2, 3, 4 ---
    
    const tableData = [
        // Row 2
        [
            { label: 'K Index:', value: data.kindex, x: col1X, xOffset: Math.round(90 * SCALE_FACTOR) },
            { label: 'Solar Wind:', value: `${data.solarwind} km/s`, x: col2X, xOffset: Math.round(130 * SCALE_FACTOR) },
            { label: 'X-Ray:', value: data.xray, x: col3X, xOffset: Math.round(70 * SCALE_FACTOR) },
        ],
        // Row 3
        [
            { label: 'Aurora:', value: data.aurora, x: col1X, xOffset: Math.round(80 * SCALE_FACTOR) },
            { label: 'Proton Flux:', value: data.protonflux, x: col2X, xOffset: Math.round(140 * SCALE_FACTOR) },
            { label: 'Helium Line:', value: data.heliumline, x: col3X, xOffset: Math.round(140 * SCALE_FACTOR) },
        ],
        // Row 4
        [
            { label: 'Mag Fld:', value: data.magneticfield, x: col1X, xOffset: Math.round(90 * SCALE_FACTOR) },
            { label: 'Geo Fld:', value: data.geomagfield, x: col2X, xOffset: Math.round(90 * SCALE_FACTOR) },
            { label: 'Lat Deg:', value: data.latdegree, x: col3X, xOffset: Math.round(90 * SCALE_FACTOR) },
        ]
    ];
    
    // Advance Y position to the start of the first looped row (Row 2)
    yPos += LINE_SPACING;

    // --- Loop to draw Rows 2, 3, and 4 ---
    tableData.forEach(row => {
        row.forEach(col => {
            // Draw the label (e.g., "K Index:")
            context.fillStyle = colors.subtitle;
            context.fillText(col.label, col.x, yPos);
            
            // Draw the value (e.g., data.kindex)
            context.fillStyle = colors.text;
            context.fillText(col.value, Math.round(col.x + col.xOffset), yPos);
        });
        
        // Advance to the next row
        yPos += LINE_SPACING;
    });

    // Draw separator line (adjusted to account for the loop's final yPos increment)
    context.strokeStyle = colors.separator;
    context.lineWidth = Math.round(2 * SCALE_FACTOR);
    context.beginPath();
    context.moveTo(BASE_PADDING, Math.round(yPos - LINE_SPACING + LINE_SPACING * 0.83));
    context.lineTo(settings.width - BASE_PADDING, Math.round(yPos - LINE_SPACING + LINE_SPACING * 0.83));
    context.stroke();


    yPos = Math.round(yPos - LINE_SPACING + LINE_SPACING * 2.33); 
    
    // --- REFACTORED HF BAND CONDITIONS (LEFT COLUMN) ---
    context.font = `bold ${settings.fontSizeLarge}px ${FONT_FAMILY}`; // Use custom font
    context.fillStyle = colors.title;
    context.fillText('HF Band Conditions', BASE_PADDING, yPos);

    context.font = `bold ${settings.fontSizeNormal}px ${FONT_FAMILY}`; // Use custom font
    context.fillStyle = colors.subtitle;
    yPos += LINE_SPACING;

    // Scale column positions and widths
    const HF_DAY_X = Math.round(96 * SCALE_FACTOR);
    const HF_NIGHT_X = Math.round(168 * SCALE_FACTOR);
    const HF_BAND_WIDTH = Math.round(80 * SCALE_FACTOR);
    
    // --- ALIGNMENT FIX APPLIED HERE FOR LEFT ALIGNMENT ---
    context.fillText('Band:', BASE_PADDING, yPos); // Draw 'Band:' label
    
    // Left-align 'Day' header to start exactly where the condition text starts (HF_DAY_X)
    context.fillText('Day', HF_DAY_X + 16, yPos); 
    
    // Left-align 'Night' header to start exactly where the condition text starts (HF_NIGHT_X)
    context.fillText('Night', HF_NIGHT_X + 2, yPos); 
    // ----------------------------------------------------

    yPos += LINE_SPACING; 
    
    Object.entries(data.calculatedconditions).forEach(([key, value]) => {
        const dayCondition = value['day'] || 'N/A';
        const nightCondition = value['night'] || 'N/A';
        
        context.fillStyle = colors.subtitle;
        context.fillText(`${key}:`, BASE_PADDING, yPos);

        // Uses the fixed highlightTextColor
        drawConditionCell(dayCondition, HF_DAY_X - 20, yPos, HF_BAND_WIDTH, context, settings, colors, setConditionColor, highlightColor, highlightTextColor);
        drawConditionCell(nightCondition, HF_NIGHT_X - 30, yPos, HF_BAND_WIDTH, context, settings, colors, setConditionColor, highlightColor, highlightTextColor);

        yPos += Math.round(LINE_SPACING * 1.16);
    });

    // --- REFACTORED VHF / EME CONDITIONS (MIDDLE COLUMN) ---
    let vhfXPos = Math.round(settings.width / 2 - 100 * SCALE_FACTOR);
    let vhfYPos = Math.round(285 * SCALE_FACTOR);
    
    context.font = `bold ${settings.fontSizeLarge}px ${FONT_FAMILY}`; // Use custom font
    context.fillStyle = colors.title;
    context.fillText('VHF / EME Conditions', vhfXPos, vhfYPos);
    
    context.font = `bold ${settings.fontSizeNormal}px ${FONT_FAMILY}`; // Use custom font
    vhfYPos += LINE_SPACING;

    const VHF_OFFSET = Math.round(90 * SCALE_FACTOR);
    
    // Declarative array for VHF conditions
    const vhfConditions = [
        { label: 'Aurora:', value: data.calculatedvhfconditions?.['vhf-aurora']?.['northern_hemi'] || 'N/A' },
        { label: '6m EsEU:', value: data.calculatedvhfconditions?.['E-Skip']?.['europe_6m'] || 'N/A' },
        { label: '4m EsEU:', value: data.calculatedvhfconditions?.['E-Skip']?.['europe_4m']  || 'N/A'},
        { label: '2m EsEU:', value: data.calculatedvhfconditions?.['E-Skip']?.['europe']  || 'N/A' },
        { label: '2m EsNA:', value: data.calculatedvhfconditions?.['E-Skip']?.['north_america']  || 'N/A' },
    ];

    vhfConditions.forEach(condition => {
        context.fillStyle = colors.subtitle;
        context.fillText(condition.label, vhfXPos, vhfYPos);

        context.fillStyle = setConditionColor(condition.value);
        context.fillText(condition.value.trim(), vhfXPos + VHF_OFFSET, vhfYPos);
        
        vhfYPos += Math.round(LINE_SPACING * 1.13);
    });

    // --- REFACTORED MUTLI-LINE DATA DRAWING (RIGHT COLUMN) ---
    let LasthfXPos = Math.round(settings.width / 2 + 160 * SCALE_FACTOR);
    let LasthfYPos = Math.round(315 * SCALE_FACTOR);

    const lineData = [
        { label: 'MUF: ', value: data.muf },
        { label: 'Norm: ', value: data.normalization },
        { label: 'A Index: ', value: data.aindex },
        { label: 'Elec Flux: ', value: data.electonflux },
    ];

    let currentYPos = LasthfYPos;

    context.font = `bold ${settings.fontSizeNormal}px ${FONT_FAMILY}`; // Use custom font

    lineData.forEach(line => {
        let currentXPos = LasthfXPos;
        currentXPos = drawSegment(context, line.label, colors.subtitle, currentXPos, currentYPos);
        currentXPos = drawSegment(context, `${line.value}`, colors.text, currentXPos, currentYPos);
        currentYPos += LINE_SPACING + 3;
    });

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
                    body { background-color: #282c34; color: #ffffff; font-family: ${FONT_FAMILY}, monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
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