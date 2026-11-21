function dateText(value){
    if(value instanceof Date)return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
    return String(value).slice(0,10);
}
function movementPart(part,movementDate,productionDate){
    const day=dateText(movementDate),productionDay=dateText(productionDate);
    return day===productionDay?part:part+'@'+day;
}
module.exports={dateText,movementPart};
