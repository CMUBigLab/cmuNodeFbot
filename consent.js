module.exports.post = function(req, res) {
	console.log(req.body)

	res.send('<body onload="window.close()">')
}