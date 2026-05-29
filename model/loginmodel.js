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
    twilioaccountsid:{
      type:String
    },
    twilioauthtoken:{
      type:String
    },
    twiliophonenumber:{
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
    metaappid: {
      type: String
    },
    metaappsecret: {
      type: String
    },
    metaredirecturi: {
      type: String
    },
    metauseraccesstoken: {
      type: String
    },
    metaadaccountid: {
      type: String
    },
    metaapiversion: {
      type: String
    },
    metajwtsecret: {
      type: String
    },
    phonenumber:{
      type:String
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "company"
    },
    companyRole: {
      type: String,
      enum: ["admin", "user"],
      default: "admin"
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "admin", default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "admin", default: null },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "admin", default: null },
    createdByName: { type: String, default: "" },
    isAgentWorkspace: {
      type: Boolean,
      default: false
    },
    googleId: {
      type: String
    },
    authProvider: {
      type: String,
      enum: ["email", "otp", "google"],
      default: "email"
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
    canAccessUserManagement: {
      type: Boolean,
      default: false
    },
    canAccessAgentManagement: {
      type: Boolean,
      default: false
    },
    isEnabled: {
      type: Boolean,
      default: false
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


