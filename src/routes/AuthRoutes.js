const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const saltRounds = 10;

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, '../anime-img-db.sqlite'), (err) => {
    if (err) console.error('Error opening database:', err);
    else {
        console.log('Connected to SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        `);
    }
});

// Login route
router.get('/login', (req, res) => {
    res.render('login', { title: 'Login' });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) {
            return res.render('login', { title: 'Login', error: 'Invalid email or password.' });
        }

        // Compare hashed password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.render('login', { title: 'Login', error: 'Invalid email or password.' });
        }

        // Set session (session is handled in app.js)
        req.session.user = { id: user.id, email: user.email, username: user.username };
        res.redirect(req.query.redirect || '/');
    });
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Register route
router.get('/register', (req, res) => {
    res.render('register', { title: 'Register' });
});

router.post('/register', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render('register', { title: 'Register', error: 'Passwords do not match' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user into SQLite database
    db.run(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [username, email, hashedPassword],
        function (err) {
            if (err) {
                return res.render('register', { title: 'Register', error: 'Email already exists or registration failed.' });
            }

            req.session.user = { id: this.lastID, email, username };
            res.redirect('/');
        }
    );
});

module.exports = router;
