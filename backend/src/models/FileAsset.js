import mongoose from "mongoose";

const fileAssetSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
    },

    fileType: {
      type: String,
      required: true,
    },

    fileName: String,

    originalName: String,

    mimeType: String,

    fileSize: Number,

    filePath: String,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "FileAsset",
  fileAssetSchema
);

