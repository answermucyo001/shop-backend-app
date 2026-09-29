require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { auth, ownerOnly } = require('./middleware/auth');
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET missing in .env'); process.exit(1); }
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', auth, require('./routes/products'));
app.use('/api/sales', auth, require('./routes/sales'));
app.use('/api/reports', auth, ownerOnly, require('./routes/reports'));
app.use('/api/users', auth, ownerOnly, require('./routes/users'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });
app.listen(process.env.PORT || 5000, () => console.log('API running on port ' + (process.env.PORT || 5000)));
