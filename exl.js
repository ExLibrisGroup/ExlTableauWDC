(function () {
	var myConnector = tableau.makeConnector();
	myConnector.init = function (initCallback) {
		initCallback();
		tableau.authType = tableau.authTypeEnum.custom;
		var prefs = getPreferences();
		if (tableau.phase == tableau.phaseEnum.authPhase) {
			$("#reportUrl").css('display', 'none');
			$('#txtApiKey').val(prefs.key);
			if (prefs.key) {
				tableau.password = prefs.key;
				tableau.submit();
			}
		}
	}

	myConnector.getSchema = function (schemaCallback) {
		var connectionData = JSON.parse(tableau.username);
		$.ajax({ 
			url: connectionData.endpoint + 
				'?path=' + connectionData.reportPath,
			type: "GET",
			beforeSend: function(xhr) { xhr.setRequestHeader('Authorization', 'apikey ' + tableau.password) }, 
			success: function(data) {
				var $xml = $( data );
				var elements = $('xsd\\:element, element', $xml);
				var cols = [];
				elements.each(function(){
					var $entry = $(this);
					cols.push( { 
						id: $entry.attr('name'), 
						alias: $entry.attr('saw-sql:columnHeading') || $entry.attr('name'), 
						dataType: mapDt($entry.attr('type'))
					});
					// TODO: fact vs dimension?
				})

				var tableInfo = {
					id: "exl_" + connectionData.reportName.toLowerCase().split(' ').join('_'),
					alias: connectionData.reportName,
					columns: cols
				};

				schemaCallback([tableInfo]);
			}
		});
	};

	myConnector.getData = function(table, doneCallback) {
		getData(null, function(data) {
			console.log('Data retrieved. Total rows', data.length);
			table.appendRows(data);
			doneCallback();
		});
	};

	tableau.registerConnector(myConnector);

	$(document).ready(function () {
		var prefs = getPreferences();
		$('#txtApiKey').val(prefs.key);
		$("#submitButton").click(function () {
			var reportPath = $('#txtReportPath').val();
			if (reportPath.indexOf('/') >= 0) reportPath = encodeURIComponent(reportPath);
			var connectionData = { 
				endpoint: $('#selectEndpoint').val(),
				reportPath: reportPath,
				reportName: decodeURIComponent(reportPath).substring(decodeURIComponent(reportPath).lastIndexOf('/')+1),
				maxRows: $('#selectMaxRows').val()
			};
			tableau.username = JSON.stringify(connectionData);
			tableau.password = $('#txtApiKey').val();
			if ($('#chkRemember').prop('checked') ) {
				prefs.key = $('#txtApiKey').val();
			} else {
				prefs.key = '';
			}
			setPreferences(prefs);
			tableau.connectionName = "ExLibris";
			tableau.submit();
		});
	});

})();

function mapDt(val) {
	var types = { 
		"xsd:int": tableau.dataTypeEnum.int,
		"xsd:string": tableau.dataTypeEnum.string,
		"xsd:double": tableau.dataTypeEnum.float,
		"xsd:bool": tableau.dataTypeEnum.bool,
		"xsd:date": tableau.dataTypeEnum.date
	};

	var type = types[val];
	if (!type) type = tableau.dataTypeEnum.string;
	return type;
}

var tableData;

function getData(resumptionToken, callback) {
	var connectionData = JSON.parse(tableau.username);
	var url = connectionData.endpoint;
	if (resumptionToken) {
		url = url + '?token=' + resumptionToken;
	} else {
		url = url + '?path=' + connectionData.reportPath;
		tableData = [];
	}
	console.log('Calling url', url);
	$.ajax({
		url: url, 
		type: "GET",
		cache: false,
		beforeSend: function(xhr) { xhr.setRequestHeader('Authorization', 'apikey ' + tableau.password) },
		success: function(data) {
			var $xml = $( data );
			var token = resumptionToken || $('ResumptionToken', $xml).text();
			var rows = $('Row', $xml);
			rows.each(function(){
				var $entry = $(this);
				var obj = {};
				$entry.children().each(function() {
					obj[this.nodeName] = $(this).text();
				});
				tableData.push(obj);
			});	
			console.log('Added rows to data table. Total', tableData.length);
			tableau.reportProgress("Getting row: " + tableData.length);
			if ($('IsFinished', $xml).text() == 'false' && tableData.length < connectionData.maxRows) {
				getData(token, callback);
			} else {
				callback(tableData);
			}		
		}
	});
}

function getPreferences () {
	var prefs;
	try {
		prefs = JSON.parse(atob(Cookies.get('prefs')))
	} catch (e) {
		prefs = { key: '' };
	}
	return prefs;
}

function setPreferences(prefs) {
	Cookies.set('prefs', btoa(JSON.stringify(prefs)), { expires: 14 });
}