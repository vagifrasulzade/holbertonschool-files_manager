import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import Queue from 'bull';
import mime from 'mime-types';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fileQueue = new Queue('fileQueue');

class FilesController {
  static async postUpload(req, res) {
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

    if (parentId !== 0 && parentId !== '0') {
      let parentFolder;

      try {
        parentFolder = await dbClient.db.collection('files').findOne({
          _id: ObjectId(parentId),
        });
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

    const fileDoc = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: (parentId === 0 || parentId === '0') ? 0 : ObjectId(parentId),
    };

    if (type === 'file' || type === 'image') {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const localFileName = uuidv4();
      const localPath = path.join(folderPath, localFileName);
      const buffer = Buffer.from(data, 'base64');

      fs.writeFileSync(localPath, buffer);

      fileDoc.localPath = localPath;
    }

    const result = await dbClient.db.collection('files').insertOne(fileDoc);

    if (type === 'image') {
      fileQueue.add({
        userId,
        fileId: result.insertedId.toString(),
      });
    }

    return res.status(201).json({
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;

    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic || false,
      parentId: file.parentId === 0 || file.parentId === '0'
        ? 0
        : file.parentId.toString(),
    });
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || '0';
    const page = parseInt(req.query.page || '0', 10);

    if (parentId !== '0' && !ObjectId.isValid(parentId)) {
      return res.status(200).json([]);
    }

    const query = {
      userId: ObjectId(userId),
      parentId: parentId === '0'
        ? { $in: [0, '0'] }
        : { $in: [ObjectId(parentId), parentId] },
    };

    const files = await dbClient.db.collection('files')
      .find(query)
      .skip(page * 20)
      .limit(20)
      .toArray();

    return res.status(200).json(files.map((file) => ({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic || false,
      parentId: file.parentId === 0 || file.parentId === '0'
        ? 0
        : file.parentId.toString(),
    })));
  }

  static async putPublish(req, res) {
    return FilesController.updatePublicStatus(req, res, true);
  }

  static async putUnpublish(req, res) {
    return FilesController.updatePublicStatus(req, res, false);
  }

  static async updatePublicStatus(req, res, isPublic) {
    const token = req.header('X-Token');

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;

    if (!ObjectId.isValid(fileId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db.collection('files').updateOne(
      { _id: ObjectId(fileId), userId: ObjectId(userId) },
      { $set: { isPublic } },
    );

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic,
      parentId: file.parentId === 0 || file.parentId === '0'
        ? 0
        : file.parentId.toString(),
    });
  }

  static async getFile(req, res) {
    console.log('GETFILE REACHED:', req.params.id);

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      console.log('Invalid id');
      return res.status(404).json({ error: 'Not found' });
    }

    const file = await dbClient.db.collection('files').findOne({
      _id: ObjectId(id),
    });

    console.log('file:', file);

    if (!file) {
      console.log('No file found');
      return res.status(404).json({ error: 'Not found' });
    }

    const token = req.header('X-Token');
    let userId = null;

    if (token) {
      userId = await redisClient.get(`auth_${token}`);
    }

    if (!file.isPublic && (!userId || file.userId.toString() !== userId)) {
      console.log('Private file and not owner');
      return res.status(404).json({ error: 'Not found' });
    }

    if (file.type === 'folder') {
      console.log('Folder requested');
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    const { size } = req.query;
    let { localPath } = file;

    if (size && ['500', '250', '100'].includes(size)) {
      localPath = `${file.localPath}_${size}`;
    }

    console.log('localPath:', localPath);

    if (!localPath || !fs.existsSync(localPath)) {
      console.log('Local file missing');
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name) || 'text/plain';
    const data = fs.readFileSync(localPath);

    res.setHeader('Content-Type', mimeType);

    console.log('Sending file data');

    return res.status(200).send(data);
  }
}

export default FilesController;
