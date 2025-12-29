import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all requests
app.use(cors());

// Serve static files from the current directory
app.use(express.static('.'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`PM5 Bluetooth Demo server running at:`);
    console.log(`  Local: http://localhost:${PORT}`);
    console.log(`  Network: http://[your-local-ip]:${PORT}`);
    console.log('');
    console.log('⚠️  Important: Web Bluetooth requires HTTPS in production!');
    console.log('   For testing with real PM5 devices, consider using:');
    console.log('   - ngrok for HTTPS tunneling');
    console.log('   - Local HTTPS setup with self-signed certificates');
    console.log('   - Chrome with --enable-web-bluetooth-new-permissions-backend flag');
});
