import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(req, res) {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const base64Credentials = authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');

    if (!credentials.includes(':')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [email, password] = credentials.split(':');

    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await dbClient.db.collection('users').findOne({
      email,
      password: sha1(password),
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    await redisClient.set(`auth_${token}`, user._id.toString(), 86400);

    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const userToken = req.header('X-Token');

    if (!userToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${userToken}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await redisClient.del(`auth_${userToken}`);

    return res.status(204).end();
  }
}

export default AuthController;
