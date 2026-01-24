// const mongoose = require("mongoose");
// const User = require("../model/loginmodel"); // adjust path

// require("dotenv").config({ path: "../.env" });

// console.log("Mongo URI:", process.env.MONGO_URI); // debug

// mongoose
//   .connect(process.env.MONGO_URI)
//   .then(async () => {
//     const result = await User.deleteMany({ role: "user" });

//     console.log("Deleted users count:", result.deletedCount);

//     await mongoose.disconnect();
//     process.exit(0);
//   })
//   .catch((err) => {
//     console.error("Error:", err.message);
//     process.exit(1);
//   });
