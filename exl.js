(function () {
	var myConnector = tableau.makeConnector();
	myConnector.init = function (initCallback) {
		initCallback();
		tableau.authType = tableau.authTypeEnum.custom;
		if (tableau.username) {
			var connectionData = JSON.parse(tableau.username);
			$('input').val([connectionData.application || 'almaws']);
			$('#txtReportPath').val(connectionData.reportPath);
			$('#selectEndpoint').val(connectionData.endpoint);			
			$('#selectMaxRows').val(connectionData.maxRows);
			$('#selectPageSize').val(connectionData.pageSize);
			if (connectionData.apikey) {
				$('#txtApiKey').val(connectionData.apikey);
			} else {
				$('#chkRemember').prop('checked',false);
			}
		}
		if (tableau.phase == tableau.phaseEnum.authPhase) {
			if (tableau.username && tableau.password)
				tableau.submit();
		}
	}

	myConnector.getSchema = function (schemaCallback) {
		var connectionData = JSON.parse(tableau.username);
		$.ajax({ 
			url: connectionData.endpoint + '/' + connectionData.application +
				'/v1/analytics/reports?path=' + connectionData.reportPath,
			type: "GET",
			beforeSend: setAuthHeader, 
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
					id: "exl_" + connectionData.reportName.toLowerCase().replace(/\W+/g, "_"),
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
			chunkData(table, tableData);
			doneCallback();
		});
	};

	tableau.registerConnector(myConnector);

	$(document).ready(function () {
		$('#tree').on('show.bs.collapse', function (e) {
			if (!$.jstree.reference('#tree')) {
				if(!$('#txtApiKey').val()) {
					$('#tree').html('<div class="alert alert-warning" role="alert">Please enter your API key.</div>');
					return;
				}
				console.log('loading jtree');
		    $('#tree').jstree({
        	'core' : {
            'data' : function(node, callback) {
                var url = (node.id == "#" ? $('#selectEndpoint').val() + '/almaws/v1/analytics/paths' : '');
    			$.ajax({
    				url: url + node.id, 
    				type: "GET",
    				dataType: "json",
    				cache: false,
    				beforeSend: setAuthHeader,
    				success: function(data) { callback(data.path.map(mapNode)); }
    			}); 
            },
	        	'themes': {
	            'name': 'proton',
	            'responsive': true
	          }
        	}
    		});
			}
		});

    $('#tree').on("changed.jstree", function (e, data) {
        var node = data.selected[0];
        $('#txtReportPath').val(node.substring(node.indexOf('path=')+5));
        $('button[href="#tree"]').click();
    });  

		$("#submitButton").click(function () {
			var reportPath = $('#txtReportPath').val();
			if (reportPath.indexOf('/') >= 0) reportPath = encodeURIComponent(reportPath);
			var connectionData = { 
				endpoint: $('#selectEndpoint').val(),
				application: $('input[name=radioApplication]:checked').val(),
				reportPath: reportPath,
				reportName: decodeURIComponent(reportPath).substring(decodeURIComponent(reportPath).lastIndexOf('/')+1),
				maxRows: $('#selectMaxRows').val(),
				pageSize: $('#selectPageSize').val()
			};
			if ($('#chkRemember').prop('checked') ) {
				connectionData.apikey = $('#txtApiKey').val();
			}
			tableau.username = JSON.stringify(connectionData);
			tableau.password = $('#txtApiKey').val();
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
	var url = connectionData.endpoint + '/' + connectionData.application;
	if (resumptionToken) {
		url = url + '/v1/analytics/reports?token=' + resumptionToken;
	} else {
		url = url + '/v1/analytics/reports?path=' + connectionData.reportPath;
		tableData = [];
	}
	url = url + '&limit=' + connectionData.pageSize;
	console.log('Calling url', url);
	$.ajax({
		url: url, 
		type: "GET",
		cache: false,
		beforeSend: setAuthHeader,
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
			if ($('IsFinished', $xml).text() == 'false' && (connectionData.maxRows == -1 || tableData.length < connectionData.maxRows)) {
				getData(token, callback);
			} else {
				callback(tableData);
			}		
		}
	});
}

function mapNode(node) {
    var report = node.type=="report";
    return {"text": node.value, "id": node.link, "children": (!report), 
        "icon": report ? "glyphicon glyphicon-file" : "",
        "state" : { "disabled" : !report }};
}

function setAuthHeader(xhr) {
    var key = tableau.password || $('#txtApiKey').val();
    xhr.setRequestHeader('Authorization', 'apikey ' + key)
}

// add the data in manageable chunks
function chunkData(table, tableData) {
	var row_index = 0;
	var size = 100;
	while (row_index < tableData.length){
		table.appendRows(tableData.slice(row_index, size + row_index));
		row_index += size;
		tableau.reportProgress("Adding row: " + row_index);
	}
}
