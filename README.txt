- Requires installation of Node.js https://nodejs.org/en/download/. 
  - No need to install additional Node.js modules / libraries, since they are already installed within this project
- Scrapes from 3 Zacks pages and 1 Yahoo page
- Run the script stocks.js in command console "node stocks.js"
- Takes list of symbols from ./SYM_LIST.txt by default, with symbols separated by newlines. 
  - Use command line argument --sp=? to change path of symbol file.
- Outputs csv data to ./Scraped.csv by default.
  - Use command line argument --op=? to change path of output file.
- Changes pacing between queries with command line argument --p=?, in the unit of milliseconds, default 100
- Turns debug on with command line argument -d or -D

example command for running the script, using input.txt and output.csv, with a pacing of 1 second, with debug on
$ node stocks.js --sp=./input.txt --op=./output.csv --p=1000 -d
