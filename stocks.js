// Scrapes data from EarningsWhipsers and Zacks into a CSV File


const UNKNOWN_NUM = "N/A"; // change this to what you want -- if the script can't find a certain number / piece of text, it should be substituted with this string for the CSV
const UNKNOWN_STR = "***Company not found"

var whispUrl = "https://earningswhispers.com/stocks/",
	zacksUrl = "https://www.zacks.com/stock/quote/",
	detailUrl = "/detailed-estimates",
	financeUrl = "/financial-overview/",
	yahooUrl1 = "https://finance.yahoo.com/quote/", yahooUrl2 = "/key-statistics?p="

var symPath = "./SYM_LIST.txt";
var outputPath = "./Scraped.csv"

var pacingDelta = 10;

var debug = false;

var request = require("request"),
	cheerio = require("cheerio"),
	fs = require("fs")
	child_process = require("child_process")
	argv = require('minimist')(process.argv.slice(2));

if (debug) console.dir(argv);

if (argv.d || argv.D) {
	debug = true;
}
if (argv.op != null) {
	outputPath = argv.op.trim();
}
if (argv.sp != null) {
	symPath = argv.sp.trim();
}
if (argv.p != null) {
	pacingDelta = argv.p;
}

// input symbols
var symStr = fs.readFileSync(symPath, 'utf-8');
var symList = symStr.toString().split("\n");

// delete blank company names
for (var i = symList.length - 1; i >= 0; i--) {
	if (symList[i].trim() == "") {
		symList.splice(i, 1);
	}
}

// maintain two separate lists for earningswhispers and zacks -- merge later, while printing

var zacksList = [];
var detailList = [];
var financeList = []
var yahooList = []

var months = {
	"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8,  "Sep": 9,  "Oct": 10,  "Nov": 11,  "Dec": 12
}

var whispResIdx = 0; // used to keep track of when to start reading zacks website.
var zacksResIdx = 0; // used to keep track of when to start generating CSV, or now, when to start detailed scraping
var detailResIdx = 0; 
var financeResIdx = 0;
var yahooResIdx = 0

var shortcut = true;

scrapeZacks(0);

// scraping from yahoo zacks for short
function yahooFactory(symbol) {
	return function(err, stdout, stderr) {
		if (!err) {
			// if (symbol == "MU") console.log(stdout);
			var $ = cheerio.load(stdout);

			var shortRatioStr = $('span:contains("Short Ratio")').parent().next().text();

			yahooList.push({
				symbol: symbol,
				shortRatio: shortRatioStr
			});

		} else {
			console.log("Error: " + err);
		}

		yahooResIdx++;
		if (yahooResIdx == symList.length) {
			printCsv2(); // done scraping - merge all of scraped data 
		}
	}
}

function scrapeYahoo(i) {
	var thisSym = symList[i].toString().trim();
	
	if (thisSym != "") {

		if (debug) console.log(thisSym  + " yahoo request");

		var tempUrl = yahooUrl1 + thisSym + yahooUrl2 + thisSym;
		var exec = "wget --no-check-certificate -qO- " + tempUrl;

		// spawn network child 
		child_process.exec(exec, {maxBuffer: 1024 * 500}, yahooFactory(thisSym));

		if (++i >= symList.length) {
			return;
		} else {
			setTimeout(scrapeYahoo, pacingDelta, i);
		}
	}

}

// scraping from financial zacks for P/S
function financeFactory(symbol) {
	return function(err, stdout, stderr) {
		if (!err) {
			var $ = cheerio.load(stdout);

			tables = $("#financial_overview_details > div > table")

			priceRatiosTable = $(tables[3])
			splitted = priceRatiosTable.text().trim().replace(/,/g, '').split("\n")

			for (s in splitted) {
				s = s.trim()
			}

			var priceSalesStr = (parseFloat(splitted[splitted.length-1])).toString()// P/S

			financeList.push({
				symbol: symbol,
				priceSales: priceSalesStr
			});

		} else {
			console.log("Error: " + err);
		}

		financeResIdx++;
		if (financeResIdx == symList.length) {
			scrapeYahoo(0);
		}
	}
}

function scrapeFinance(i) {
	var thisSym = symList[i].toString().trim();
	
	if (thisSym != "") {

		if (debug) console.log(thisSym  + " finance request");

		var tempUrl = zacksUrl + thisSym + financeUrl;
		var exec = "wget --no-check-certificate -qO- " + tempUrl;

		// spawn network child 
		child_process.exec(exec, financeFactory(thisSym));

		if (++i >= symList.length) {
			return;
		} else {
			setTimeout(scrapeFinance, pacingDelta, i);
		}
	}

}

// scraping from detailed zacks
function detailFactory(symbol) {
	return function(err, stdout, stderr) {
		if (!err) {
			// console.log(stdout);
			var $ = cheerio.load(stdout);

			var revQ1Str, deltaRevQ1Str, earnQ1Str, deltaEarnQ1Str, deltaEarnQ2Str, deltaEarnF1Str, deltaEarnF2Str

			earningsStr = $("#detailed_earnings_estimates").each(
				function(tableIdx) {
					// console.log(tableIdx)

					cheer = cheerio.load($(this).html().trim()) // reload html due to id clash

					if (tableIdx == 0) { // first table "Sales Estimates", these two tables share an ID oddly
						cheer("table > tbody > tr").each(
							function(index) {
								var rowText = $(this).text().trim()
								var splitted = rowText.split("\n")

								if (index == 0) { // Zacks Consensus estimate / RevQ1
									revQ1Str = splitted[1].trim()
									ten = revQ1Str[revQ1Str.length-1]
									if (ten == "B") {
										revQ1Str = (1000.0 * parseFloat(revQ1Str.slice(0,revQ1Str.length-1))).toString()
									} else if (ten == "M") {
										revQ1Str = revQ1Str.slice(0,revQ1Str.length-1)
									} // todo ELSE CASE. not B or M. K?
								} else if (index == 5) { //Year of Year / deltRevQ1
									deltaRevQ1Str = splitted[1].trim()
									if (deltaRevQ1Str[deltaRevQ1Str.length-1] == "%") { // removing percent
										deltaRevQ1Str = deltaRevQ1Str.slice(0, deltaRevQ1Str.length-1)
										
									}
								}
							}
						)
					} else if (tableIdx == 1) { // second table, "Earnings Esimates"
						cheer("table > tbody > tr").each(
							function(index) {
								var rowText = $(this).text().trim()
								var splitted = rowText.split("\n")

								if (index == 0) { // Zacks Consensus estimate / earnQ1
									earnQ1Str = splitted[1]
								} else if (index == 6) {
									deltaEarnQ1Str  = splitted[1].trim()
									if (deltaEarnQ1Str[deltaEarnQ1Str.length-1] == '%') { // getting rid of percent
										deltaEarnQ1Str = deltaEarnQ1Str.slice(0, deltaEarnQ1Str.length-1).replace(/,/g, '') 
									}
									deltaEarnQ2Str = splitted[2].trim()
									if (deltaEarnQ2Str[deltaEarnQ2Str.length-1] == '%') {
										deltaEarnQ2Str = deltaEarnQ2Str.slice(0, deltaEarnQ2Str.length-1).replace(/,/g, '') 
									}
									deltaEarnF1Str = splitted[3].trim()
									if (deltaEarnF1Str[deltaEarnF1Str.length-1] == '%') {
										deltaEarnF1Str = deltaEarnF1Str.slice(0, deltaEarnF1Str.length-1).replace(/,/g, '') 
									}
									deltaEarnF2Str = splitted[4].trim()
									if (deltaEarnF2Str[deltaEarnF2Str.length-1] == '%') {
										deltaEarnF2Str = deltaEarnF2Str.slice(0, deltaEarnF2Str.length-1).replace(/,/g, '') 
									}
								}
							}
						)
					}

				}
			)

			// PE Ind 
			var growthEstimatesRows = $("#earnings_growth_estimates > table > tbody > tr")

			var peIndRow = $(growthEstimatesRows[6]).text().trim().replace(/,/g, '').split("\n")

			var peIndStr = parseFloat(peIndRow[peIndRow.length-2]).toString()

			// console.log(symbol,peIndStr, peIndRow)
			
			detailList.push({
				symbol: symbol,

				revQ1: revQ1Str,
				deltaRevQ1: deltaRevQ1Str,

				earnQ1: earnQ1Str,

				deltaEarnQ1: deltaEarnQ1Str,
				deltaEarnQ2: deltaEarnQ2Str,
				deltaEarnF1: deltaEarnF1Str,
				deltaEarnF2: deltaEarnF2Str,

				peInd: peIndStr
			});

		} else {
			console.log("Error: " + err);
		}

		detailResIdx++;
		if (detailResIdx == symList.length) {
			scrapeFinance(0);
		}
	}
}


function scrapeDetail(i) {
	var thisSym = symList[i].toString().trim();
	
	if (thisSym != "") {

		if (debug) console.log(thisSym  + " detail request");

		var tempUrl = zacksUrl + thisSym + detailUrl;
		var exec = "wget --no-check-certificate -qO- " + tempUrl;

		// spawn network child 
		child_process.exec(exec, detailFactory(thisSym));

		if (++i >= symList.length) {
			return;
		} else {
			setTimeout(scrapeDetail, pacingDelta, i);
		}
	}

}

function zacksFactory(symbol) {
	return function(err, stdout, stderr) {
		if (!err) {
			// console.log(stdout);
			var $ = cheerio.load(stdout);

			// corresponds to column "Zax"
			var rankStr = $("#premium_research > div > table > tbody > tr > td > span").text().trim().substring(0,1);

			// corresponds to column "Ind"
			var indStr = $("#premium_research > div > table > tbody > tr > td > a").text();

			indStr = indStr.substring(indStr.indexOf("(")+1);
			indStr = indStr.substring(0, indStr.indexOf(" ")).trim();

			if (rankStr == "") {
				rankStr = UNKNOWN_NUM;
			}
			if (indStr == "") {
				indStr = UNKNOWN_NUM;
			}

			console.log(symbol, indStr)

			var nameStr = symbol;

			// BEGIN new columns

			var closeStr = $("#get_last_price").text().trim()

			var espStr = "", dateStr = "", pef1Str = "", hiStr = "", avgVolStr = "", capStr = "";

			var keyRows = $("#stock_key_earnings > table > tbody > tr").each(
				function(index) {
					var rowText = $(this).text().toString().trim();

					if (index == 0) { // ESP
						espStr = "";

						var splitted = rowText.split(" ")
						var percent = splitted[splitted.length-1]
						var num = percent.slice(0, percent.length-1)
						
						espStr = num

					} else if (index == 4) { // date
						dateStr = "";

						for (var i = rowText.length-1; i >= 0; i--) {
							if (isNaN(rowText[i]) && rowText[i] != "/") {
								break;
							}
							dateStr = rowText[i] + dateStr
						}

						dateStr = dateStr.trim()
					} else if (index == 7) { // PE_F1
						pef1Str = ""
						splitted = rowText.split(" ")
						pef1Str = splitted.slice(-1)[0] 
					}
				} 
			)

			var stockRows = $("#stock_activity > table > tbody > tr").each(
				function(index) {
					var rowText = $(this).text().toString().trim();

					if (index == 4) { // hi52
						hiStr = ""
						splitted = rowText.split(" ")

						hiStr = splitted.slice(-1)[0]
					} else if (index == 5) { // average volume
						avgVolStr = ""
						splitted = rowText.split(" ")

						avgVolStr = splitted.slice(-1)[0].replace(/,/g, '') 
					} else if (index == 6) { // market cap
						capStr = ""
						splitted = rowText.replace(/,/g, '') .split(" ")

						ten = splitted.slice(-1)[0]
						if (ten == "B") {
							capStr = (1000.0 * parseFloat(splitted[splitted.length-2])).toString()
						} else if (ten == "M") {
							capStr = splitted[splitted.length-2]
						} // todo ELSE CASE. not B or M. K?
					}
				})
			

			// END new columns

			if (debug) console.log(nameStr + " zacks response");

			var idk = {
				close: closeStr,
				symbol: nameStr,
				rank: rankStr,
				ind: indStr,
				esp: espStr,
				date: dateStr,
				pef1: pef1Str,

				hi: hiStr,
				avgVol: avgVolStr,
				cap: capStr
			}

			zacksList.push({
				close: closeStr,
				symbol: nameStr,
				rank: rankStr,
				ind: indStr,
				esp: espStr,
				date: dateStr,
				pef1: pef1Str,

				hi: hiStr,
				avgVol: avgVolStr,
				cap: capStr


			});

		} else {
			console.log("Error: " + err);
		}

		zacksResIdx++;
		if (zacksResIdx == symList.length) {
			scrapeDetail(0);
		}
	}
}

function scrapeZacks(i) {
	var thisSym = symList[i].toString().trim();
	
	if (thisSym != "") {

		if (debug) console.log(thisSym  + " zacks request");

		var tempUrl = zacksUrl + thisSym;
		var exec = "wget --no-check-certificate -qO- " + tempUrl;

		// spawn network child 
		child_process.exec(exec, zacksFactory(thisSym));

		if (++i >= symList.length) {
			return;
		} else {
			setTimeout(scrapeZacks, pacingDelta, i);
		}
	}

}

// sorts lists based on symbol
function cmp(a, b){
	if (a.symbol < b.symbol) {
		return -1;
	} 
	if (a.symbol > b.symbol) {
		return 1;
	}
	return 0;
}


function purify(testString) { // ensure "N/A" is displayed or UNKNOWN_STR when a value isn't found online
	if (testString == null || testString == "" || testString.includes("NA") || testString.includes("NaN")) {
		return UNKNOWN_NUM;
	} else {
		return testString.trim();
	}
}

// takes the multiple lists and prints them as csv to outputPath
function printCsv2() {
	if (debug) console.log("lengths: " + zacksList.length + " " + detailList.length + " " + financeList.length + " " + yahooList.length);

	// merge 
	if (debug) console.log("Merging lists...\n");

	zacksList.sort(cmp);
	detailList.sort(cmp);
	financeList.sort(cmp);
	yahooList.sort(cmp);
	
	var csvStr = "\"Symbol\",\"Date\",\"Close\",\"52Hi\",\"MktCap\",\"Delta ErnQ1\",\"Delta RevQ1\",\"RevQ1\",\"ErnQ1\",\"Zax\",\"Ind\",\"Delta ErnQ2\",\"Delta ErnF1\",\"Delta EarnF2\",\"PE F1\",\"PE Ind\",\"P/S\",\"ESP\",\"Avg Vol\",\"Short\"\n";
	for (var i = 0; i < symList.length; i++) {
		csvStr += "\"";
		csvStr += purify(zacksList[i].symbol).replace(/\"/g, "");
		csvStr += "\",\""; // assuming no commas in data for now 
		csvStr += purify(zacksList[i].date).replace(/\"/g, ""); 
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].close).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].hi).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].cap).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].deltaEarnQ1).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].deltaRevQ1).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].revQ1).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].earnQ1).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].rank).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].ind).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].deltaEarnQ2).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].deltaEarnF1).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].deltaEarnF2).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].pef1).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(detailList[i].peInd).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(financeList[i].priceSales).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].esp).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(zacksList[i].avgVol).replace(/\"/g, "");
		csvStr += "\",\"";
		csvStr += purify(yahooList[i].shortRatio).replace(/\"/g, "");
		csvStr += "\"\n";
	}

	fs.writeFileSync(outputPath, csvStr , "utf-8");
}