// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      
    },
    email: {
      type: String,
    },
    password: {
      type: String,
    },
    
    twilioid:{
      type:String
    },
    whatsappid:{
      type:String
    },
    whatsapptoken:{
      type:String
    },
    whatsappbussiness:{
      type:String
    },
    phonenumber:{
      type:String
    },
    missedcallwebhook:{
      type:String
    },
    missedcallautomationenabled: {
      type: Boolean,
      default: true
    },
    missedcalldelayminutes: {
      type: Number,
      default: 5
    },
    missedcallautomationmode: {
      type: String,
      enum: ["immediate", "nightly_batch"],
      default: "immediate"
    },
    missedcallnighthour: {
      type: Number,
      default: 21
    },
    missedcallnightminute: {
      type: Number,
      default: 0
    },
    missedcalltimezone: {
      type: String,
      default: "Asia/Kolkata"
    },
    missedcalltemplatename: {
      type: String,
      default: ""
    },
    missedcalltemplatelanguage: {
      type: String,
      default: "en_US"
    },
    missedcalltemplatevariables: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },

    resetPasswordToken: {
  type: String,
},
resetPasswordExpires: {
  type: Date,
},

  role: {
      type: String,
      enum: ["user", "admin","superadmin"],
      default: "user", 
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model("admin", UserSchema);
