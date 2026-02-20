import { Actor } from 'apify';
import got from 'got';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

await Actor.init();

const input = await Actor.getInput();
const inmateName = input?.name || 'Rankin Shawn';

const baseUrl = 'http://inmate-search.cobbsheriff.org';

const searchUrl =
  `${baseUrl}/inquiry.asp?soid=&inmate_name=${encodeURIComponent(inmateName)}&serial=&qry=In+Custody`;

// Create proxy
const proxyConfiguration = await Actor.createProxyConfiguration({
  groups: ['RESIDENTIAL'],
});

const proxyUrl = await proxyConfiguration.newUrl();

// Create proper agents
const httpAgent = new HttpProxyAgent(proxyUrl);
const httpsAgent = new HttpsProxyAgent(proxyUrl);

const cookieJar = new CookieJar();

const client = got.extend({
  cookieJar,
  agent: {
    http: httpAgent,
    https: httpsAgent,
  },
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
  }
});

// Visit homepage
await client.get(baseUrl);

// Perform search
const searchResponse = await client.get(searchUrl);
const $search = cheerio.load(searchResponse.body);

const detailsRelativeUrl =
  $search('a[href*="InmDetails.asp"]').first().attr('href');

if (!detailsRelativeUrl) {
  console.log('Still blocked or no inmate found.');
  await Actor.exit();
}

const detailsUrl = new URL(detailsRelativeUrl, baseUrl).href;

// Visit details page
const detailsResponse = await client.get(detailsUrl);
const $ = cheerio.load(detailsResponse.body);

const data = {};

$('tr').each((_, row) => {
  const headers = $(row).find('th');
  const values = $(row).find('td');

  if (headers.length && values.length && headers.length === values.length) {
    headers.each((i, header) => {
      const key = $(header).text().trim();
      const value = values.eq(i).text().trim();
      if (key) data[key] = value;
    });
  }
});

await Actor.pushData(data);
await Actor.exit();
