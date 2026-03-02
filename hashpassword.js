const bcrypt = require('bcryptjs');

const password = 'testpassword'; // Your plain password
const hashedPassword = bcrypt.hashSync(password, 10); // Hashing the password
console.log(hashedPassword); // This will output the hashed password