// Backend Setup for FaithConnect Member Sign-up
// This includes database setup, API endpoints, and frontend integration

// 1. DATABASE SETUP (PostgreSQL)
// First, create your PostgreSQL database and table

/*
-- SQL Commands to run in your PostgreSQL database
// psql -u faithconnect_db;

CREATE DATABASE faithconnect_db;


CREATE TABLE members (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10),
    address TEXT,
    church_role VARCHAR(50) DEFAULT 'member',
    join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_phone ON members(phone);
*/

// 2. BACKEND API (Node.js + Express + PostgreSQL)
// package.json dependencies you'll need:
/*
{
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "bcryptjs": "^2.4.3",
    "joi": "^17.11.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "jsonwebtoken": "^9.0.2"
  }
}
*/

// // Connect to PostgreSQL
// psql -U postgres
// //  List databases
// \l

// // Create database if it doesn't exist
// CREATE DATABASE faithconnect_db;

// //  Connect to database
// \c faithconnect_db

// // Check if members table exists
// \dt







const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();


const app = express();

// Middleware
app.use(cors({
    origin: ['https://faithconnectapp.vercel.app/','https://faithconnectapp-ow9jpodet-osilamas-projects.vercel.app', 'http://localhost:5173','faithconnectapp-rklw51uif-osilamas-projects.vercel.app'],
    credentials: true

}));
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
    // user: process.env.DB_USER,
    // host: process.env.DB_HOST,
    // database: process.env.DB_NAME,
    // password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 6543,
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
        sslmode: 'require',

    },
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    retryAttempts: 3 // Number of times to retry a failed connectio
});

// After pool configuration
pool.on('error', (err, client) => {
    console.error('Unexpected database error on idle client:', err);
    if (client) client.release();
    process.exit(-1);
});



// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection test failed:', err.message);
    } else {
        console.log('Database connection test successful');
    }
});

// Test connection with retry logic
const testConnection = async () => {
    let retries = 4;
    while (retries) {
        try {
            const client = await pool.connect();
            console.log('Database connected successfully');
            client.release();
            break;
        } catch (err) {
            console.error('Database connection error:', err.message);
            retries -= 1;
            console.log(`Retries left: ${retries}`);
            await new Promise(res => setTimeout(res, 5000)); // Wait 5 seconds before retrying
        }
    }
};

testConnection();




// Validation schema
const memberSignupSchema = Joi.object({
    firstName: Joi.string().min(2).max(100).required(),
    lastName: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional().messages({
        'string.pattern.base': 'Phone number must be valid international format'
    }),
    password: Joi.string().min(8).required(),
    dateOfBirth: Joi.date().optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    address: Joi.string().max(500).optional(),
    churchRole: Joi.string().max(50).optional()
});

// Member signup endpoint
app.post(`/members/signup`, async (req, res) => {
    try {
        // Validate input
        const { error, value } = memberSignupSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }

        const {
            firstName,
            lastName,
            email,
            phone,
            password,
            dateOfBirth,
            gender,
            address,
            churchRole
        } = value;

        // Check if email already exists
        const existingMember = await pool.query(
            'SELECT id FROM members WHERE email = $1',
            [email]
        );

        if (existingMember.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new member
        const insertQuery = `
      INSERT INTO members(
    first_name, last_name, email, phone, password_hash,
    date_of_birth, gender, address, church_role
) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, first_name, last_name, email, church_role, join_date
    `;

        const newMember = await pool.query(insertQuery, [
            firstName,
            lastName,
            email,
            phone || null,
            passwordHash,
            dateOfBirth || null,
            gender || null,
            address || null,
            churchRole || 'member'
        ]);

        // Generate JWT token
        const token = jwt.sign(
            {
                id: newMember.rows[0].id,
                email: newMember.rows[0].email,
                role: newMember.rows[0].church_role
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'Member registered successfully',
            data: {
                member: newMember.rows[0],
                token
            }
        });

    } catch (error) {
        console.error('Signup error:', {
            message: error.message,
            stack: error.stack,
            detail: error.detail,

        });
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : error.message

        });
    }
});

// Member login endpoint
app.post(`/members/login`, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find member by email
        const member = await pool.query(
            'SELECT id, first_name, last_name, email, password_hash, church_role, is_active FROM members WHERE email = $1',
            [email]
        );

        if (member.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const memberData = member.rows[0];

        // Check if account is active
        if (!memberData.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, memberData.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: memberData.id,
                email: memberData.email,
                role: memberData.church_role
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                member: {
                    id: memberData.id,
                    firstName: memberData.first_name,
                    lastName: memberData.last_name,
                    email: memberData.email,
                    churchRole: memberData.church_role
                },
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get member profile (protected route)
app.get('/members/profile', authenticateToken, async (req, res) => {
    try {
        const member = await pool.query(
            'SELECT id, first_name, last_name, email, phone, date_of_birth, gender, address, church_role, join_date FROM members WHERE id = $1',
            [req.user.id]
        );

        if (member.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        res.json({
            success: true,
            data: member.rows[0]
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
