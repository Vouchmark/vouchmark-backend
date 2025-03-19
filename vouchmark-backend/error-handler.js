const noLayout = '../views/layouts/nothing.ejs'
const { StatusCodes } = require('http-status-codes')

const errorHandlerMiddleware = async (err, req, res, next) => {
    
    console.log(err)

    let customError = {
      //set default 
      statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
      msg: 'An error Occured'
  
    }

    if(err.name === 'ValidationError'){
      customError.msg = Object.values(err.errors).map((item) => item.message).join(',')
      customError.statusCode = 400
    }
  
    if(err.code && err.code === 11000){
      customError.msg = `Duplicate Value entered for ${Object.keys(err.keyValue)} field, please choose another value`
      customError.statusCode = StatusCodes.BAD_REQUEST
    }
  
    if(err.name == 'CastError'){
      customError.msg = `No item found with id : ${err.value}`
      customError.statusCode = 404
    }
    return res.status(customError.statusCode).json({ message: customError.msg})
  }

  module.exports = errorHandlerMiddleware
  

            
//   if(error.code === 11000) {
//     res.status(409).json({message: 'User already in use'})
// }


