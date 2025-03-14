const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const requireAuth = require('../middleware/requireAuth');

const db = new sqlite3.Database(path.join(__dirname, '../anime-img-db.sqlite'), (err) => {
    if (err) console.error('Error opening database:', err);
    else {
        console.log('Connected to SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                tags TEXT,
                orientation TEXT,
                filename TEXT NOT NULL,
                url TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
});

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Helper function to determine image orientation
async function getOrientation(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const { width, height } = metadata;
        return width > height ? 'landscape' : width < height ? 'portrait' : 'square';
    } catch (error) {
        return 'unknown';
    }
}

// Upload Page
router.get('/upload', requireAuth, (req, res) => {
    res.render('upload', { title: 'Upload Image' });
});

// Image Upload Handler
router.post('/upload', requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render('upload', { title: 'Upload Image', error: 'User session not found. Please log in.' });
        }

        if (!req.file) {
            return res.render('upload', { title: 'Upload Image', error: 'No file uploaded' });
        }

        const { title, description, tags } = req.body;
        const orientation = await getOrientation(req.file.buffer);
        const userId = req.session.user.id;
        const fileName = `${userId}_${Date.now()}.png`;
        const uploadPath = path.join(__dirname, '../uploads', fileName);

        // Ensure the upload directory exists
        if (!fs.existsSync(path.join(__dirname, '../uploads'))) {
            fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
        }

        // Optimize and save the image locally
        const optimizedImage = await sharp(req.file.buffer)
            .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .toBuffer();

        fs.writeFileSync(uploadPath, optimizedImage);

        // Construct public URL
        const publicUrl = `/uploads/${fileName}`;

        // Insert metadata into the SQLite database
        db.run(
            `INSERT INTO images (title, description, tags, orientation, filename, url, user_id, username)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [title || 'Untitled', description || '', tags || '', orientation, fileName, publicUrl, userId, req.session.user.username],
            function (err) {
                if (err) {
                    return res.render('upload', { title: 'Upload Image', error: 'Database error: ' + err.message });
                }
                res.render('upload', { title: 'Upload Image', success: 'Image uploaded successfully!' });
            }
        );
    } catch (error) {
        res.render('upload', { title: 'Upload Image', error: `Upload failed: ${error.message}` });
    }
});

// Display user's uploaded images
router.get('/my-images', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    db.all('SELECT * FROM images WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, images) => {
        if (err) {
            return res.status(500).render('error', { title: 'Error', message: 'Failed to load images' });
        }
        res.render('my-image-list', { title: 'My Images', images });
    });
});

// View all images (with search and pagination)
router.get('/images', (req, res) => {
    const search = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const offset = (page - 1) * limit;

    const query = search
        ? `SELECT * FROM images WHERE title LIKE ? OR tags LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
        : `SELECT * FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    const params = search ? [`%${search}%`, `%${search}%`, limit, offset] : [limit, offset];

    db.all(query, params, (err, images) => {
        if (err) {
            return res.render('imagelist', { title: 'Image Gallery', error: 'Failed to load images', images: [] });
        }
        res.render('imagelist', { title: 'Image Gallery', images });
    });
});

// View image details
router.get('/images/:id', (req, res) => {
    db.get('SELECT * FROM images WHERE id = ?', [req.params.id], (err, image) => {
        if (err || !image) {
            return res.status(404).render('error', { title: 'Image Not Found', message: 'The requested image could not be found' });
        }
        res.render('imagedetail', { title: image.title, image });
    });
});


// GET route for the edit form
router.get('/images/:id/edit', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    db.get('SELECT * FROM images WHERE id = ? AND user_id = ?', [req.params.id, userId], (err, image) => {
        if (err || !image) {
            return res.status(404).render('error', { title: 'Image Not Found', message: 'The requested image could not be found or you don’t have permission to edit it.' });
        }
        res.render('edit-image', { title: `Edit ${image.title}`, image });
    });
});

// Edit image details
router.post('/images/:id/edit', requireAuth, (req, res) => {
    const { title, description, tags } = req.body;
    const userId = req.session.user.id;

    db.run(
        `UPDATE images SET title = ?, description = ?, tags = ? WHERE id = ? AND user_id = ?`,
        [title, description, tags, req.params.id, userId],
        function (err) {
            if (err || this.changes === 0) {
                return res.status(403).render('error', { title: 'Error', message: 'Update failed or unauthorized' });
            }
            res.redirect(`/images/${req.params.id}`);
        }
    );
});

// Delete image
router.post('/images/:id/delete', requireAuth, (req, res) => {
    const userId = req.session.user.id;

    db.get('SELECT * FROM images WHERE id = ? AND user_id = ?', [req.params.id, userId], (err, image) => {
        if (err || !image) {
            return res.status(403).render('error', { title: 'Error', message: 'Delete failed or unauthorized' });
        }

        const filePath = path.join(__dirname, '../uploads', image.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        db.run('DELETE FROM images WHERE id = ?', [req.params.id], function (deleteErr) {
            if (deleteErr) {
                return res.status(500).render('error', { title: 'Error', message: 'Failed to delete image' });
            }
            res.redirect('/images');
        });
    });
});

module.exports = router;
