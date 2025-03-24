// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server. We'll learn more about it in Part C.

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials',
});

// database configuration
const dbConfig = {
    host: 'db', // the database server
    port: 5432, // the database port
    database: process.env.POSTGRES_DB, // the database name
    user: process.env.POSTGRES_USER, // the user account to connect with
    password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test your database
db.connect()
    .then(obj => {
        console.log('Database connection successful'); // you can view this message in the docker compose logs
        obj.done(); // success, release the connection;
    })
    .catch(error => {
        console.log('ERROR:', error.message || error);
    });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.

// initialize session variables
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        saveUninitialized: false,
        resave: false,
    })
);

app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);


// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************

// TODO - Include your API routes here

app.get('/', (req, res) => {
    // Redirect to the /login route
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('pages/login');
});

app.get('/register', (req, res) => {
    res.render('pages/register');
});

app.post('/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        await db.none('INSERT INTO users(username, password) VALUES($1, $2)', [req.body.username, hashedPassword]);

        res.redirect('/login');
    } catch (error) {
        console.error('Error during registration:', error);

        res.render('pages/register', { message: 'Registration failed. Please try again.', error: true });
    }
});

app.get('/login', (req, res) => {
    res.render('pages/login');
});

app.post('/login', async (req, res) => {
    try {
        const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [req.body.username]);

        if (!user) {
            return res.redirect('/register');
        }

        const match = await bcrypt.compare(req.body.password, user.password);

        if (!match) {
            return res.render('pages/login', { message: 'Incorrect username or password.', error: true });
        }

        req.session.user = user;
        req.session.save(() => {
            res.redirect('/discover');
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.render('pages/login', { message: 'Login failed. Please try again.', error: true });
    }
});
// Authentication Middleware.
const auth = (req, res, next) => {
    if (!req.session.user) {
        // Default to login page.
        return res.redirect('/login');
    }
    next();
};

// Authentication Required
app.use(auth);

app.get('/discover', async (req, res) => {
    try {
        const response = await axios({
            url: 'https://app.ticketmaster.com/discovery/v2/events.json',
            method: 'GET',
            dataType: 'json',
            headers: {
                'Accept-Encoding': 'application/json',
            },
            params: {
                apikey: process.env.API_KEY,
                keyword: 'concert',
                size: 30
            }
        });

        const events = response.data._embedded ? response.data._embedded.events : [];

        res.render('pages/discover', { events });
    } catch (error) {
        console.error('Error fetching events:', error);

        res.render('pages/discover', { events: [], message: 'Failed to load events. Please try again later.', error: true });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.render('pages/logout', { message: 'Error logging out. Please try again.', error: true });
        }

        res.render('pages/logout', { message: 'Logged out successfully.' });
    });
});


// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
app.listen(3000);
console.log('Server is listening on port 3000');