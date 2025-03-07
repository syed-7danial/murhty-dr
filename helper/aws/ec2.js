const { custom_logging }  = require ('../helper.js')

const modifyVpnConnectionRoute = async (ec2, endpoint, ips, addRoutes) => {
    const action = addRoutes ? 'added' : 'removed';
    for (let ip of ips) {
        if( ip.includes("--")){
            ip = ip.split("--")[1]
        }
        let params = {
            DestinationCidrBlock: `${ip}`, 
            VpnConnectionId: endpoint 
        };
        if (!global.DRY_RUN) {
            await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
            await (addRoutes ? ec2.createVpnConnectionRoute(params) : ec2.deleteVpnConnectionRoute(params)).promise()
        }
        custom_logging(`${action} '${ip}' in ${endpoint}`);
    }
}

module.exports = {modifyVpnConnectionRoute}
