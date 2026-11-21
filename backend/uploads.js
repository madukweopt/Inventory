// Where staff photos and company logos are stored, and the upload rules for them. Moved from server.js unchanged.
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const multer=require('multer');

const publicDirectory=path.join(__dirname,"..","public");
const htmlDirectory=path.join(publicDirectory,"html");
const picturesDirectory=
	process.env.RAILWAY_VOLUME_MOUNT_PATH||
	path.join(publicDirectory,"images");
const employeePhotosDirectory=path.join(picturesDirectory,"employees");
const companyLogosDirectory=path.join(picturesDirectory,"company");

fs.mkdirSync(employeePhotosDirectory,{ recursive: true });
fs.mkdirSync(companyLogosDirectory,{ recursive: true });

const employeePhotoExtensions={
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp'
};

const employeePhotoStorage=multer.diskStorage({
	// Stores employee photographs in the publicly served employee image directory.
	destination: function(req,file,done) {
		done(null,employeePhotosDirectory);
	},
	// Gives every uploaded photograph a unique server-generated filename.
	filename: function(req,file,done) {
		const extension=employeePhotoExtensions[file.mimetype];
		done(null,'employee-'+crypto.randomUUID()+extension);
	}
});

const employeePhotoUpload=multer({
	storage: employeePhotoStorage,
	limits: {
		fileSize: 2*1024*1024
	},
	// Accepts only the image formats supported by the employee form.
	fileFilter: function(req,file,done) {
		if(!employeePhotoExtensions[file.mimetype]) {
			return done(new Error('Only JPG, PNG and WebP images are allowed'));
		}
		done(null,true);
	}
});

const companyLogoStorage=multer.diskStorage({
	// Stores company logos in the publicly served company image directory.
	destination: function(req,file,done) {
		done(null,companyLogosDirectory);
	},
	// Gives each replacement logo a unique server-generated filename.
	filename: function(req,file,done) {
		const extension=employeePhotoExtensions[file.mimetype];
		done(null,'company-'+crypto.randomUUID()+extension);
	}
});

const companyLogoUpload=multer({
	storage: companyLogoStorage,
	limits: {
		fileSize: 2*1024*1024
	},
	// Accepts the image formats supported by the company logo control.
	fileFilter: function(req,file,done) {
		if(!employeePhotoExtensions[file.mimetype]) {
			return done(new Error('Only JPG, PNG and WebP images are allowed'));
		}
		done(null,true);
	}
});

// Removes an uploaded photograph when its employee record cannot be saved.
function removeUploadedEmployeePhoto(file) {
	if(!file) return;
	fs.unlink(file.path,function(error) {
		if(error&&error.code!=='ENOENT') {
			console.error('Could not remove unused employee photograph:',error);
		}
	});
}

// Removes a previously stored custom image without touching shared application images.
function removeCustomImage(imagePath,directoryPrefix,storageDirectory) {
	if(!imagePath||!imagePath.startsWith(directoryPrefix)) return;
	const filename=path.basename(imagePath);
	const absolutePath=path.join(storageDirectory,filename);
	fs.unlink(absolutePath,function(error) {
		if(error&&error.code!=='ENOENT') {
			console.error('Could not remove replaced image:',error);
		}
	});
}

module.exports={publicDirectory,htmlDirectory,employeePhotosDirectory,companyLogosDirectory,employeePhotoUpload,companyLogoUpload,removeUploadedEmployeePhoto,removeCustomImage};
