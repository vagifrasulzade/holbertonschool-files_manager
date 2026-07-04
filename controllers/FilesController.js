import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(req, res) {
    // 1. Retrieve the user based on the token
    const token = req.header('X-Token');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      type,
      parentId = 0,
      isPublic = false,
      data,
    } = req.body;
    // 2. Validate input parameters
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const acceptedTypes = ['folder', 'file', 'image'];
    if (!type || !acceptedTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // 3. Validate parentId if provided
    if (parentId !== 0 && parentId !== '0') {
      let parentFolder;
      try {
        parentFolder = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      } catch (err) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (!parentFolder) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFolder.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // 4. Build document to save in the database
    const fileDoc = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: (parentId === 0 || parentId === '0') ? 0 : ObjectId(parentId),
    };

    // 5. Handle file/image storage on local disk
    if (type === 'file' || type === 'image') {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      // Auto-create directory if not present
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const localFileName = uuidv4();
      const localPath = path.join(folderPath, localFileName);

      // Store the file in clear from base64 string
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(localPath, buffer);

      // Append absolute local path to database document
      fileDoc.localPath = localPath;
    }

    // 6. Save document to MongoDB
    const result = await dbClient.db.collection('files').insertOne(fileDoc);

    // 7. Return the new file format according to the API requirements
    const responseDoc = {
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    return res.status(201).json(responseDoc);
  }
}

export default FilesController;
