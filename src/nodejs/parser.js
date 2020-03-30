class Parser {
    constructor(config = {}) {
        this.newLineChar = require('os').EOL;
        this.https = require('https');
        this.fs = require('fs');
        this.config = config;
        this.config.protocol = 'https://';
        this.config.domain = 'www.tripadvisor.com';
        this.initFile();
        this.initRequest();
        this.checkedHref = {};
        this.savedEmail = {};
        this.actions = [];
        this.startTime = Date.now();
        this.saved = 0;
        this.checkedCity = 0;
    }
    initRequest() {
        this.request = (params) => {
            return new Promise((resolve, reject) => {
                this.https.request(params, (response) => {
                        if (response.statusCode < 200 || response.statusCode >= 300) {
                            return reject(response);
                        }
                        var body = [];
                        response.on('data', function(chunk) {
                            body.push(chunk);
                        });
                        response.on('end', () => {
                            body = Buffer.concat(body).toString();
                            resolve(body);
                        });
                    })
                    .on('error', (error) => {
                        reject(error);
                    })
                    .end();
            });
        }
    }
    initFile() {
        this.fs.access(this.config.pathToSaveFile, this.fs.constants.W_OK, (err) => {
            if (err) {
                throw err;
            }
        });
    }
    log(text) {
        if(text){
            this.actions.push(new Date().toLocaleTimeString() + ': ' + text);
        }
        if (this.actions.length > 10) {
            this.actions.shift();
        }
        let upTime = Date.now() - this.startTime;
        let upTimeSeconds = Math.floor(upTime / 1000);
        let upTimeMinute = Math.floor(upTimeSeconds / 60);
        let upTimeHours = Math.floor(upTimeMinute / 60);
        let upTimeString = '';
        if (upTimeHours) {
            upTimeMinute -= upTimeHours * 60;
            upTimeString += upTimeHours + 'hours ';
        }
        if (upTimeMinute) {
            upTimeSeconds -= upTimeMinute * 60;
            upTimeString += upTimeMinute + 'min ';
        }
        if (upTimeSeconds) {
            upTimeString += upTimeSeconds + 'sec';
        }
        console.clear();
        console.log(this.newLineChar);
        console.log('Saved ' + this.saved+ ' mail');
        if (this.checkedCity) {
            console.log(this.newLineChar);
            console.log('Checked ' + this.checkedCity+ ' city');
        }
        console.log(this.newLineChar);
        console.log('Up ' + upTimeString);
        console.log(this.newLineChar);
        if (this.currentCity) {
            console.log(this.currentCity);
            console.log(this.newLineChar);
        }
        if (this.currentPage) {
            console.log('Page ' + this.currentPage);
            console.log(this.newLineChar);
        }
        console.log('_________________________');
        console.log(this.newLineChar);
        console.log(this.actions.join(this.newLineChar + this.newLineChar));
    }
    error(err) {
        console.error(err);
        require('fs').appendFile(
            './error.log',
            new Date().toLocaleString() + ' : ' + err + require('os').EOL,
            'utf8',
            (appendError) => {
                if (appendError) throw appendError;
            }
        );
    }
    save(email) {
        if (this.savedEmail.hasOwnProperty(email) === false) {
            this.saved++;
            this.savedEmail[email] = true;
            this.log('Save ' + email);
            this.fs.appendFile(this.config.pathToSaveFile, email + this.newLineChar, 'utf8', (appendError) => {
                if (appendError) throw appendError;
            });
        }
    }
    parsePagesCountry(url){
        return this.request(new URL(url))
            .then(async (citiesHtml) => {
                let title = citiesHtml.match(/<title>(?<title>[\w\s-]+)<\/title>/).groups.title;
                if (process.platform == 'win32') {
                    process.title = title;
                } else {
                    process.stdout.write(
                        String.fromCharCode(27) + "]0;" + title + String.fromCharCode(7)
                    );
                }
                let cities = citiesHtml.matchAll(/><a href="(?<href>\/Restaurants-g[\d\w-]+\.html)"\s+onclick="[\w\s()',]+">(?<name>[\w\s]+)</g);
                for (let city of cities) {
                    await this.parseCity(city.groups);
                    this.checkedCity++;
                }
                let nextPageUrl = citiesHtml.match(/href="(?<href>\/Restaurants-g[\w-]{4,50}\.html#LOCATION_LIST)" class="guiArw sprite\-pageNext/);
                if(nextPageUrl){
                    await this.parsePagesCountry(this.config.protocol + this.config.domain + nextPageUrl.groups.href);
                }
            })
            .catch(this.error);
    }
    parseCity(city) {
        this.currentCity = city.name;
        return this.parsePagesCity(city.href);
    }
    parsePagesCity(pageHref) {
        let pageUrl = new URL(this.config.protocol + this.config.domain + pageHref);
        return this.request(pageUrl)
            .then(async (restaurantsHtml) => {
                let curpage = restaurantsHtml.match(/class="pageNum current .+" onclick=".+">(?<number>\d+)<\/span>/);
                if (curpage === null) {
                    this.currentPage = 1;
                } else {
                    this.currentPage = curpage.groups.number;
                }
                this.log();
                let restaurants = restaurantsHtml.matchAll(/href="(?<href>\/Restaurant_Review-g[\d\w-]+\.html)" class="\w+" target="\w+">(?<name>[\d]{1,2}.{1,90})<\/a>/g);
                for (let restaurant of restaurants) {
                    await this.parseRestaurant(restaurant.groups);
                }
                let nextPageUrl = restaurantsHtml.match(/href="(?<href>\/Restaurants-g.{20,150})" class="nav next /);
                if(nextPageUrl){
                    await this.parsePagesCity(nextPageUrl.groups.href);
                }
            })
            .catch(this.error);
    }
    parseRestaurant(restaurant) {
        let name = restaurant.name.replace('<!-- -->. <!-- -->', '. ');
        name = name.replace('&amp;', '&');
        name = name.replace('&#x27;', "'");
        name = name.replace(/\&.{2,5};/, '');
        this.log('Parse ' + name);
        let url = new URL(this.config.protocol + this.config.domain + restaurant.href);
        return this.request(url)
            .then((restaurantHtml) => {
                let email = restaurantHtml.match(/href="mailto:(?<email>.{1,50}@[^?]{1,50})\?/);
                if (email) {
                    this.save(email.groups.email);
                }
            })
            .catch(this.error);
    }
    run() {
        process.stdout.write('\x1Bc');
        this.parsePagesCountry(this.config.startLink);
    }
}

module.exports = Parser;