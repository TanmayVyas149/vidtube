import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) {
      console.error('No file path provided to uploadOnCloudinary');
      return null;
    }

    // Check if file exists before upload
    if (!fs.existsSync(localFilePath)) {
      console.error(`File does not exist at path: ${localFilePath}`);
      return null;
    }

    console.log(`Uploading file to Cloudinary: ${localFilePath}`);

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
    });

    console.log('Cloudinary upload successful:', response);

    // Delete local file after successful upload
    fs.unlinkSync(localFilePath);

    return response;
  } catch (error) {
    console.error('Cloudinary upload error:', error);

    // Attempt to delete local file even on error (if exists)
    if (localFilePath && fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
      } catch (unlinkError) {
        console.error('Error deleting local file after upload failure:', unlinkError);
      }
    }

    return null;
  }
};
const deleteFromCloudinary = async (publicId) => {
    try{
       const result = await cloudinary.uploader.destroy
       (publicId)
       console.log("Deleted from cloudinary, Public Id")
    }catch (error){
        console.log("Error deleting from cloudinary",error)
        return null
    }
}
export { uploadOnCloudinary };
