const jwt = require('jsonwebtoken');
// Verifies the Bearer token and attaches req.user = {id, username, name, role}
exports.auth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired, please log in again' }); }
};
exports.ownerOnly = (req, res, next) =>
  req.user.role === 'owner' ? next() : res.status(403).json({ error: 'Owner access only' });
