import Queue from 'bull';
import fs from 'fs';
import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue');

fileQueue.process(async (job) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }

  if (!userId) {
    throw new Error('Missing userId');
  }

  const file = await dbClient.db.collection('files').findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });

  if (!file) {
    throw new Error('File not found');
  }

  const sizes = [500, 250, 100];

  await Promise.all(
    sizes.map(async (size) => {
      const thumbnail = await imageThumbnail(file.localPath, {
        width: size,
      });

      fs.writeFileSync(`${file.localPath}_${size}`, thumbnail);
    }),
  );
});

console.log('Thumbnail worker started...');
