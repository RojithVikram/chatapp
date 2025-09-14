// backend/models/Message.js
const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    fromUserId: { type: String, required: true },
    fromUsername: { type: String, required: true },

    // Room message
    room: { type: String, default: "general", index: true },

    // Private message (DM)
    toUserId: { type: String, default: null, index: true },
    toUsername: { type: String, default: null },

    text: { type: String, required: true },
    time: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Helpful compound index for querying history
MessageSchema.index({ room: 1, createdAt: -1 });
MessageSchema.index({ toUserId: 1, fromUserId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", MessageSchema);
