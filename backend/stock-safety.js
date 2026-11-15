async function lockStock(client) {
    // Corrections and new weighings share this lock, preventing check/write races.
    await client.query('SELECT pg_advisory_xact_lock(91002)');
}
async function stockFloor(client) {
    const result=await client.query(`SELECT item_id,
        to_char(count_date,'YYYY-MM-DD')||'|'||to_char(created_at,'YYYY-MM-DD HH24:MI:SS.US')||'|'||lpad(count_id::text,20,'0') AS point,
        SUM(received-issued) OVER(PARTITION BY item_id ORDER BY count_date,created_at,count_id ROWS UNBOUNDED PRECEDING) AS balance
        FROM stock_counts ORDER BY item_id,count_date,created_at,count_id`);
    const snapshot=new Map();
    for(const row of result.rows) {
        if(!snapshot.has(row.item_id))snapshot.set(row.item_id,[]);
        snapshot.get(row.item_id).push({point:row.point,balance:Number(row.balance)});
    }
    return snapshot;
}
async function protectStock(client,before) {
    const after=await stockFloor(client);
    for(const itemId of new Set([...before.keys(),...after.keys()])) {
        const old=before.get(itemId)||[],current=after.get(itemId)||[];
        const points=[...new Set([...old,...current].map(row=>row.point))].sort();
        let oldIndex=0,currentIndex=0,oldBalance=0,balance=0;
        for(const point of points) {
            while(oldIndex<old.length&&old[oldIndex].point<=point)oldBalance=old[oldIndex++].balance;
            while(currentIndex<current.length&&current[currentIndex].point<=point)balance=current[currentIndex++].balance;
            if(balance<Math.min(0,oldBalance)-0.00001) throw Object.assign(new Error('This correction would leave later stock short. Record the correct replacement receipt or review the dependent usage before changing it.'),{status:409});
        }
    }
}
module.exports={lockStock,stockFloor,protectStock};
