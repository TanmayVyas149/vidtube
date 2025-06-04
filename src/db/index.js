import mongoose from 'mongoose';
import { DB_NAME } from "../constants.js";
console.log("MongoDB URI from .env:", process.env.MONGODB_URI);

const connectDB = async () => {
    try{
const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
        console.log(`\n MongoDB connected ! DB host: ${connectionInstance.connection.host} `);
    }catch(error){
console.log("MongoDB connection error",error);
process.exit(1)   
}
}
export default connectDB