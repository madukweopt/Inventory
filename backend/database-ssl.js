// Database connections are always secure (SSL, with the server's certificate checked), as Neon requires.
// The only exception is DATABASE_SSL=disable, meant for the temporary test database GitHub starts for the
// automatic test runs, which has no certificate. It is refused when NODE_ENV=production.
function databaseSsl() {
    if(process.env.DATABASE_SSL!=='disable') return { rejectUnauthorized:true };
    if(process.env.NODE_ENV==='production') throw new Error('DATABASE_SSL=disable is not allowed in production.');
    return false;
}
module.exports={ databaseSsl };
