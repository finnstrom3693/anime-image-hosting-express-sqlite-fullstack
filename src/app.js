const express = require('express');
const path = require('path');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configure Express middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configure session (for user authentication)
app.use(session({
    secret: process.env.SESSION_SECRET || 'anime-image-hosting-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Configure EJS with layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Pass user to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Import routes
const indexRoutes = require('./routes/IndexRoutes');
const authRoutes = require('./routes/AuthRoutes');
const imageRoutes = require('./routes/ImageRoutes');

// Use routes
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', imageRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: 'Server Error',
        message: err.message || 'Something went wrong!'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist'
    });
});

// Start server
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));