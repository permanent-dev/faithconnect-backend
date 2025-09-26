import request from 'supertest';
import { expect } from 'chai';
const app = require('../../NodeApp');
import pool from '../../db.js';


describe('Health Check', () => {
    after(async () => {
        await pool.end(); // Close database connections after tests
    });

    it('should return health status', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);

        expect(response.body).to.have.property('status');
        expect(response.body).to.have.property('database');
        expect(response.body.status).to.equal('healthy');
    });

    it('should connect to database', async () => {
        try {
            const result = await pool.query('SELECT NOW()');
            expect(result.rows).to.exist;
        } catch (error) {
            throw new Error('Database connection failed: ' + error.message);
        }
    });
});