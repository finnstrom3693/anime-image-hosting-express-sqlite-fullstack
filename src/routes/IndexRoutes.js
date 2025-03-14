const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', { title: 'Anime Image Hosting' });
});

module.exports = router;