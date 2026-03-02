const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const fs = require('fs'); // Import fs module

const app = express();
const port = 3000;

// PostgreSQL Pool Setup
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'online_learning',
    password: '12345',
    port: 5432,
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true }); // Create the directory if it doesn't exist
}

// Serve the uploads directory
app.use('/uploads', express.static(uploadsDir));

// Configure storage for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Save files to the uploads directory
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to prevent duplicates
    }
});

// Set a limit of 100MB for file uploads
const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({ secret: 'your_secret', resave: false, saveUninitialized: true }));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login/:role', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Add route for reports.html
app.get('/reports.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reports.html'));
});

// Add route for Instructor Dashboard
app.get('/instructor_main.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'instructor_main.html'));
});

// Login Route
app.post('/login/:role', async (req, res) => {
    const { username, password } = req.body;
    const role = req.params.role;
    let roleId;

    // Map roles to role IDs
    switch (role) {
        case 'user':
            roleId = 1;
            break;
        case 'instructor':
            roleId = 2;
            break;
        case 'admin':
            roleId = 3;
            break;
        case 'guest':
            return res.redirect('/guest_main.html'); // Guest doesn't require authentication
        default:
            return res.status(400).json({ status: 'error', message: 'Invalid role.' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND role_id = $2', [username, roleId]);
        const user = result.rows[0];

        if (user && bcrypt.compareSync(password, user.password)) {
            // Store session data
            req.session.userId = user.id;
            req.session.role = role;
            req.session.username = user.username;

            // Redirect to the correct dashboard based on role
            if (role === 'admin') {
                res.redirect(`/admin_main.html?username=${encodeURIComponent(user.username)}`);
            } else if (role === 'instructor') {
                res.redirect(`/instructor_main.html?username=${encodeURIComponent(user.username)}`);
            } else if (role === 'user') {
                res.redirect(`/user_main.html?username=${encodeURIComponent(user.username)}`);
            }
        } else {
            res.status(401).json({ status: 'error', message: 'Login failed. Invalid username or password.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Server error.' });
    }
});

// Register Route
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
    const { username, password, role_id } = req.body; 
    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 AND role_id = $2', [username, role_id]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Username already exists for this role.' });
        }

        await pool.query('INSERT INTO users (username, password, role_id) VALUES ($1, $2, $3)', 
        [username, hashedPassword, role_id]);
        res.status(201).json({ status: 'success', message: 'User registered successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error registering user.' });
    }
});

// Fetch Users
app.get('/get_users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username FROM users ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ status: 'error', message: 'Error fetching users.' });
    }
});

// Delete User
app.delete('/delete_user/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: 'error', message: 'User not found.' });
        }
        res.status(200).json({ status: 'success', message: 'User deleted successfully!' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ status: 'error', message: 'Error deleting user.' });
    }
});

// Route for User Management
app.get('/management.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'management.html'));
});

// Upload guest content
app.post('/upload_content', upload.none(), async (req, res) => {
    const { title, type, link } = req.body;

    // Check if title, type, and link are present
    if (!title || !type || !link) {
        return res.status(400).json({ status: 'error', message: 'Title, type, and link are required.' });
    }

    try {
        await pool.query('INSERT INTO guest_content (title, type, link) VALUES ($1, $2, $3)', 
        [title, type, link]);
        res.json({ status: 'success', message: 'Content uploaded successfully!' });
    } catch (error) {
        console.error('Error uploading content:', error);
        res.status(500).json({ status: 'error', message: 'Error uploading content.' });
    }
});

// Fetch Reports
app.get('/get_reports', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ status: 'error', message: 'Error fetching reports.' });
    }
});

// Fetch Guest Content
app.get('/get_guest_content', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM guest_content ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching guest content:', error);
        res.status(500).json({ status: 'error', message: 'Error fetching guest content.' });
    }
});

// Report Submission Route
app.post('/submit_report', async (req, res) => {
    const { name, desc, recipient } = req.body;

    try {
        await pool.query('INSERT INTO reports (name, description, recipient) VALUES ($1, $2, $3)', 
        [name, desc, recipient]);
        res.status(201).json({ status: 'success', message: 'Report submitted successfully!' });
    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({ status: 'error', message: 'Error submitting report.' });
    }
});

// CRUD Operations for Courses
// Create Course
app.post('/add_course', async (req, res) => {
    const { title, instructor, description, content } = req.body;

    try {
        const result = await pool.query('INSERT INTO courses (title, instructor, description) VALUES ($1, $2, $3) RETURNING id', 
        [title, instructor, description]);
        const courseId = result.rows[0].id;

        if (content && Array.isArray(content)) {
            for (const item of content) {
                await pool.query('INSERT INTO course_content (course_id, pdf_link, video_link) VALUES ($1, $2, $3)', 
                [courseId, item.pdfLink, item.videoLink]);
            }
        }

        res.status(201).json({ status: 'success', message: 'Course added successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error adding course: ' + error.message });
    }
});

// Update Course
app.put('/update_course/:id', async (req, res) => {
    const { id } = req.params;
    const { title, instructor, description } = req.body;

    try {
        await pool.query('UPDATE courses SET title = $1, instructor = $2, description = $3 WHERE id = $4', 
        [title, instructor, description, id]);
        res.status(200).json({ status: 'success', message: 'Course updated successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error updating course: ' + error.message });
    }
});

// Delete Course
app.delete('/delete_course/:id', async (req, res) => {
    const { id } = req.params;

    // Ensure user is an instructor
    if (req.session.role !== 'instructor') {
        return res.status(403).json({ status: 'error', message: 'Forbidden: Only instructors can delete courses.' });
    }

    try {
        const result = await pool.query('DELETE FROM courses WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ status: 'error', message: 'Course not found.' });
        }
        res.status(200).json({ status: 'success', message: 'Course deleted successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error deleting course: ' + error.message });
    }
});

// Fetch Courses
app.get('/get_courses', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM courses ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error fetching courses.' });
    }
});

// Fetch Course Details
app.get('/get_course/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const courseResult = await pool.query('SELECT * FROM courses WHERE id = $1', [id]);
        const contentResult = await pool.query('SELECT * FROM course_content WHERE course_id = $1', [id]);

        if (courseResult.rows.length > 0) {
            const course = courseResult.rows[0];
            const content = contentResult.rows;
            res.json({ course, content });
        } else {
            res.status(404).json({ status: 'error', message: 'Course not found.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error fetching course details.' });
    }
});

// CRUD Operations for Quizzes

// Create Quiz
app.post('/add_quiz', async (req, res) => {
    const { title, link } = req.body;

    try {
        await pool.query('INSERT INTO quizzes (title, link) VALUES ($1, $2)', [title, link]);
        res.status(201).json({ status: 'success', message: 'Quiz added successfully!' });
    } catch (error) {
        console.error('Error adding quiz:', error);
        res.status(500).json({ status: 'error', message: 'Error adding quiz: ' + error.message });
    }
});

// Fetch Quizzes
app.get('/get_quizzes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM quizzes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Error fetching quizzes.' });
    }
});

// Route to upload assessments
app.post('/upload_assessment', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded or file too large.' });
    }

    const userId = req.session.userId; // Get the ID of the logged-in user
    const fileName = req.file.originalname;
    const filePath = `/uploads/${req.file.filename}`; // Set path for the file to be accessible

    try {
        await pool.query('INSERT INTO uploads (user_id, file_name, file_path) VALUES ($1, $2, $3)', 
        [userId, fileName, filePath]);
        res.json({ status: 'success', message: 'File uploaded successfully!' });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ status: 'error', message: 'Error uploading file.' });
    }
});

// Add Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/admin_main.html'); // Redirect back if there’s an error
        }
        res.clearCookie('connect.sid'); // Clear the cookie
        res.redirect('/'); // Redirect to index.html
    });
});

// Route to fetch assessments
app.get('/get_assessments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM uploads ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching assessments:', error);
        res.status(500).json({ status: 'error', message: 'Error fetching assessments.' });
    }
});

// Route for guest main page
app.get('/guest_main.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'guest_main.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});