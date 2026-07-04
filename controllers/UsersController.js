import { ObjectId } from 'mongodb';
import User from '../models/User';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Missing email' });
    } else if (!password) {
      res.status(400).json({ error: 'Missing password' });
    } else if (await User.findByEmail(email)) {
      res.status(400).json({ error: 'Already exist' });
    } else {
      const newUser = await User.create(email, password);
      res.status(201).json({ id: newUser.id, email: newUser.email });
    }
  }

  static async getUsersMe(req, res) {
    const userToken = req.header('X-Token');

    if (!userToken) {
      res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = await redisClient.get(`auth_${userToken}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await dbClient.db.collection('users').findOne({
      _id: new ObjectId(userId),
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(200).json({
      id: user._id.toString(),
      email: user.email,
    });
  }
}
export default UsersController;
