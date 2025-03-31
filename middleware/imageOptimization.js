const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Image optimization middleware
 * Processes uploaded images to optimize them and generate thumbnails
 */
const optimizeImage = async (req, res, next) => {
  // Skip if no file was uploaded
  if (!req.file) {
    return next();
  }

  try {
    const file = req.file;
    
    // Check if the file is an image that can be processed by sharp
    const isImage = file.mimetype.startsWith('image/');
    if (!isImage) {
      // Skip optimization for non-image files
      return next();
    }

    const filename = path.parse(file.filename).name;
    const ext = '.webp'; // Convert all images to WebP for better compression
    
    const optimizedFilename = `${filename}-optimized${ext}`;
    const thumbnailFilename = `${filename}-thumbnail${ext}`;
    
    const optimizedPath = path.join(file.destination, optimizedFilename);
    const thumbnailPath = path.join(file.destination, thumbnailFilename);
    
    // Create an optimized version
    await sharp(file.path)
      .resize(1200) // Resize to max width of 1200px
      .webp({ quality: 80 }) // Convert to WebP with 80% quality
      .toFile(optimizedPath);
      
    // Create a thumbnail 
    await sharp(file.path)
      .resize(300) // Thumbnail size
      .webp({ quality: 60 })
      .toFile(thumbnailPath);
      
    // Delete the original file
    fs.unlinkSync(file.path);
    
    // Update the file info in the request object
    req.file.originalPath = file.path;
    req.file.path = optimizedPath;
    req.file.filename = optimizedFilename;
    req.file.mimetype = 'image/webp';
    
    // Add thumbnail info
    req.file.thumbnail = {
      path: thumbnailPath,
      filename: thumbnailFilename,
      url: `/uploads/${thumbnailFilename}`
    };
    
    next();
  } catch (error) {
    console.error('Image optimization error:', error);
    next();
  }
};

module.exports = optimizeImage; 