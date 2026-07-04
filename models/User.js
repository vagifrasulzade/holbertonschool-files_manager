import { ObjectId } from 'mongodb';
import dbClient from '../utils/db.mjs';
import SHA1 from 'sha1';
class User {
    static async create(email, password) {
        const user = {
            email,
            password: SHA1(password),};

        const result = await dbClient.db.collection('users').insertOne(user);
        return {
            id: result.insertedId,
            email,
        };
    }

    static async findByEmail(email) {
        return dbClient.db.collection('users').findOne({ email });
    }
}

export default User;
    