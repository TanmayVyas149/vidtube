import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import fs from "fs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// ======================== Token Generation ========================
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Error generating tokens");
  }
};

// ======================== Register ========================
const registerUser = asyncHandler(async (req, res) => {
  const { fullname, email, username, password } = req.body;
  if ([fullname, email, username, password].some(f => !f || f.trim() === ""))
    throw new ApiError(400, "All fields are required");

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) throw new ApiError(409, "User with email or username exists");

  const avatarPath = req.files?.avatar?.[0]?.path;
  const coverPath = req.files?.coverImage?.[0]?.path;
  if (!avatarPath) throw new ApiError(400, "Avatar is required");

  let avatar, coverImage;
  try {
    avatar = await uploadOnCloudinary(avatarPath);
    if (coverPath) coverImage = await uploadOnCloudinary(coverPath);
  } catch (error) {
    if (fs.existsSync(avatarPath)) fs.unlinkSync(avatarPath);
    if (coverPath && fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    throw new ApiError(500, error.message);
  }

  fs.existsSync(avatarPath) && fs.unlinkSync(avatarPath);
  coverPath && fs.existsSync(coverPath) && fs.unlinkSync(coverPath);

  try {
    const user = await User.create({
      fullname,
      email,
      username: username.toLowerCase(),
      password,
      avatar: avatar.url,
      coverImage: coverImage?.url || ""
    });
    const cleanUser = await User.findById(user._id).select("-password -refreshToken");
    return res.status(201).json(new ApiResponse(201, cleanUser, "User registered"));
  } catch (error) {
    if (avatar) await deleteFromCloudinary(avatar.public_id);
    if (coverImage) await deleteFromCloudinary(coverImage.public_id);
    throw new ApiError(500, "User creation failed");
  }
});

// ======================== Login ========================
const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  if (!email && !username) throw new ApiError(400, "Email or username required");

  const user = await User.findOne({ $or: [{ email }, { username }] });
  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production" };
  const safeUser = await User.findById(user._id).select("-password -refreshToken");

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, { user: safeUser, accessToken, refreshToken }, "Login successful"));
});

// ======================== Logout ========================
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } }, { new: true });
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production" };
  return res.clearCookie("accessToken", options)
            .clearCookie("refreshToken", options)
            .status(200)
            .json(new ApiResponse(200, {}, "Logged out"));
});

// ======================== Token Refresh ========================
const refreshAccessToken = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken || req.body.refreshToken;
  if (!token) throw new ApiError(401, "Refresh token required");

  try {
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded._id);
    if (!user || user.refreshToken !== token) throw new ApiError(401, "Invalid token");

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);
    const options = { httpOnly: true, secure: process.env.NODE_ENV === "production" };

    return res.cookie("accessToken", accessToken, options)
              .cookie("refreshToken", refreshToken, options)
              .status(200)
              .json(new ApiResponse(200, { accessToken, refreshToken }, "Token refreshed"));
  } catch (error) {
    throw new ApiError(401, "Invalid refresh token");
  }
});

// ======================== Account Management ========================
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!(await user.isPasswordCorrect(oldPassword))) throw new ApiError(401, "Incorrect old password");

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  return res.status(200).json(new ApiResponse(200, {}, "Password updated"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(new ApiResponse(200, req.user, "Current user"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;
  if (!fullname || !email) throw new ApiError(400, "Fullname and email required");

  const user = await User.findByIdAndUpdate(req.user._id, { fullname, email }, { new: true }).select("-password -refreshToken");
  return res.status(200).json(new ApiResponse(200, user, "Account updated"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const path = req.file?.path;
  if (!path) throw new ApiError(400, "Avatar required");

  const avatar = await uploadOnCloudinary(path);
  fs.existsSync(path) && fs.unlinkSync(path);

  const user = await User.findByIdAndUpdate(req.user._id, { avatar: avatar.url }, { new: true }).select("-password -refreshToken");
  return res.status(200).json(new ApiResponse(200, user, "Avatar updated"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const path = req.file?.path;
  if (!path) throw new ApiError(400, "Cover image required");

  const coverImage = await uploadOnCloudinary(path);
  fs.existsSync(path) && fs.unlinkSync(path);

  const user = await User.findByIdAndUpdate(req.user._id, { coverImage: coverImage.url }, { new: true }).select("-password -refreshToken");
  return res.status(200).json(new ApiResponse(200, user, "Cover image updated"));
});

// ======================== Profile & History ========================
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username) throw new ApiError(400, "Username required");

  const channel = await User.aggregate([
    { $match: { username: username.toLowerCase() } },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo"
      }
    },
    {
      $addFields: {
        subscribersCount: { $size: "$subscribers" },
        channelsSubscribedToCount: { $size: "$subscribedTo" },
        isSubscribed: {
          $in: [req.user._id, "$subscribers.subscriber"]
        }
      }
    },
    {
      $project: {
        fullname: 1,
        username: 1,
        avatar: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        coverImage: 1,
        email: 1
      }
    }
  ]);

  if (!channel.length) throw new ApiError(404, "Channel not found");

  return res.status(200).json(new ApiResponse(
    200,
    channel[0],
    "Channel profile fetched successfully"
  ));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};

