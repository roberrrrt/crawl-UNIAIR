const puppeteer = require('puppeteer');
const moment = require('moment-timezone');
moment.suppressDeprecationWarnings = true; // 關閉錯誤提示
const { gateway, expectedDep, expectedArr, mobileNum, email, creditCardInfo, customers } = require('./config');

// 信用卡種類
const creditCardMap = {
  1: 'VI', // VISA
  2: 'CA', // MasterCard
  3: 'AX', // American Express
  4: 'JB' // JCB
};

/**
 * 組合來回時間字串
 */
const combinationDate = () => {
  const start = moment(expectedDep).tz('Asia/Taipei').format('YYYY/MM/DD');
  const end = moment(expectedArr).tz('Asia/Taipei').format('YYYY/MM/DD');

  return `${start}-${end}`;
}

/**
 * 檢查是否在時間內
 *
 * @param {String} type 去程或返程
 * @param {String} listTime 列表時間
 *
 * @returns {Boolean}
 */
const checkTime = (type, listTime) => {
  const ticketTime = moment(listTime).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss');

  let expectedTime = type === 'dep' ? expectedDep : expectedArr;
  const expectedDate = moment(expectedTime).tz('Asia/Taipei').format();
  const start = moment(expectedDate).subtract(1, 'hours').format();
  const end = moment(expectedDate).add(1, 'hours').format();

  if (moment(ticketTime).isBefore(end) && moment(ticketTime).isAfter(start)) {
    return true;
  }

  return false;
}

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath:
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false
  });
  const page = await browser.newPage();

  /**
   * 檢查是否有預期的時間機票
   */
  const checkTimeList = async (type) => {
    for (let i = 0; i < 6; i++) {
      const listTime = await page.$$eval(`#CPH_Body_uc_SelectFlight_rpt_Flight_btn_SelectFlightCheck_${i}`, el => el.map(x => x.getAttribute("data-dep"))[0]);

      if (listTime) {
        const isExpect = checkTime(type, listTime);

        if (isExpect) {
          return i;
        }
      }

      if (i === 5) {
        const errMsg = {
          code: 0,
          msg: `沒有任何匹配的${type === 'dep' ? '出發' : '返程'}時間.`,
        }

        throw errMsg;
      }

      continue;
    }
  }

  try {
    await page.goto(gateway.url); // 進入指定頁面
    // await page.type('input[title="Google 搜尋"]', 'flex'); // Google 搜尋特定項目
    await page.click('#btn_ViewPolicy'); // 關閉cookie
    await page.click('#pnl_page > div:nth-child(4) > div > div.-booking-widget.aos-init.aos-animate > div.input-form > div.row.mb-3 > div.col-auto > div > label:nth-child(2)'); // 點擊來回
    await page.click('#CPH_Body_pnl_BookingWidget_DEP > div'); // 點起程點
    await page.select('#ddl_DEP', 'RMQ') // 選擇台中

    // 選擇日期動作
    await page.click('#CPH_Body_pnl_BookingWidget_TRIP_DATE > div'); // 選擇日期
    await page.$eval('#CPH_Body_tb_TRIP_DATE', (e) => e.removeAttribute("readonly"));
    await page.keyboard.press('Backspace');

    const roundTripTime = combinationDate();
    await page.keyboard.type(roundTripTime);
    await page.$eval('#CPH_Body_hi_TRIP_DATE', (el, value) => el.value = value, roundTripTime);

    // 選擇旅客動作
    const customerCount = customers.length;
    await page.click('#CPH_Body_pnl_BookingWidget_PAX_NUM'); // 選擇人數
    for (let i = 1; i < customerCount; i++)
      await page.click('#CPH_Body_pnl_BookingWidget_PAX_NUM > div > div > div:nth-child(1) > div > div.col-5 > div > div:nth-child(3) > button');
    await page.click('#CPH_Body_pnl_BookingWidget_PAX_NUM > div > div > button') // 按下完成

    await page.click('#CPH_Body_btn_SelectFlight') // 按下搜尋
    await page.waitForTimeout(2000); // 等待一秒

    /* 點擊去程機票頁面 */
    await page.waitForSelector('#pnl_page > div.page-inner.px-md-3 > div.stepwizard.mb-0.mb-md-3 > div > div'); // 確定網頁的元素出現
    // const spanVal = await page.$eval('#CPH_Body_uc_SelectFlight_rpt_Flight_lb_DepTime_2', el => el.innerText); // 顯示包在tag裡面文字(參考用)

    const depOrderNum = await checkTimeList('dep');
    await page.click(`#CPH_Body_uc_SelectFlight_rpt_Flight_btn_SelectFlight_${depOrderNum}`);

    await page.mouse.move(0, 0);
    await page.waitForTimeout(1000); // 等待一秒
    await page.select('#CPH_Body_rpt_FareType_rpt_FareInfo_0_ddl_Num_0', customerCount.toString()) // 選擇數量
    await page.click('#CPH_Body_btn_NextStep');

    await page.waitForSelector('#pnl_page > div.page-inner.px-md-3 > div.stepwizard.mb-0.mb-md-3 > div > div'); // 確定網頁的元素出現

    /* 點擊回程機票頁面 */
    const arrOrderNum = await checkTimeList('arr');
    await page.click(`#CPH_Body_uc_SelectFlight_rpt_Flight_btn_SelectFlight_${arrOrderNum}`);

    await page.mouse.move(0, 0);
    await page.waitForTimeout(1000); // 等待一秒
    await page.click('#CPH_Body_btn_NextStep');

    // 確認聲明頁面
    await page.waitForSelector('#pnl_page > div.page-inner.px-md-3'); // 確定網頁的元素出現
    await page.evaluate(() => {
      document.querySelector('#CPH_Body_cb_CheckTrem').click();
    });
    await page.click('#CPH_Body_btn_NextStep');

    // 旅客資料頁面
    await page.waitForSelector('#pnl_page > div.page-inner.px-md-3'); // 確定網頁的元素出現

    for (let customer of customers) {
      const { index, lastName, firstName, gender, born, identityID } = customer;

      await page.type(`#CPH_Body_rpt_PassengerList_tb_LastName_${index}`, lastName); // 姓氏
      await page.type(`#CPH_Body_rpt_PassengerList_tb_FirstName_${index}`, firstName); // 名字
      await page.select(`#CPH_Body_rpt_PassengerList_ddl_Title_${index}`, gender) // 性別

      await page.waitForTimeout(500); // 等待一秒
      await page.click(`#CPH_Body_rpt_PassengerList_tb_Birthday_${index}`); // 選擇生日
      await page.$eval(`#CPH_Body_rpt_PassengerList_tb_Birthday_${index}`, (e) => e.removeAttribute("readonly"));
      await page.keyboard.press('Backspace');
      await page.keyboard.type(born);
      await page.$eval(`#CPH_Body_rpt_PassengerList_hi_Birthday_${index}`, (el, value) => el.value = value, born);

      await page.click(`#CPH_Body_rpt_PassengerList_btn_SelectCountry_${index}`); // 選擇國家
      await page.waitForTimeout(500); // 等待一秒
      await page.click(`#CPH_Body_rpt_Country_li_item_0`); // 選擇TW
      // await page.$eval(`#CPH_Body_rpt_PassengerList_hi_Country_${index}`, el => el.value = 'TW');

      await page.waitForTimeout(500); // 等待一秒
      await page.type(`#CPH_Body_rpt_PassengerList_tb_ID_NO_${index}`, identityID); // 身分證
    }

    await page.click('#CPH_Body_btn_SelectNational_Mobile'); // 選擇手機區碼
    await page.waitForTimeout(500); // 等待一秒
    await page.click(`#CPH_Body_rpt_National_li_item_0`); // 選擇TW
    await page.type('#CPH_Body_tb_Contact_Mobile_Number', mobileNum); // Mobile number

    await page.type('#CPH_Body_tb_Email', email); // Email
    await page.waitForTimeout(1000); // 等待一秒
    await page.click('#CPH_Body_btn_NextStep');

    // 信用卡付款頁面
    await page.waitForSelector('#CPH_Body_pnl_updatePanel > div.page-inner.px-md-3 > div:nth-child(6)'); // 確定網頁的元素出現
    await page.evaluate(() => {
      document.querySelector('#CPH_Body_cb_UseOneCard').click();
    });
    await page.select('#CPH_Body_ddl_OC_CardType', creditCardMap[creditCardInfo.type]) // 卡別
    await page.type('#CPH_Body_tb_OC_CardNo', creditCardInfo.number); // 卡號
    await page.select('#CPH_Body_ddl_OC_CardExpireM', creditCardInfo.expiryMonth); // 到期月份
    await page.select('#CPH_Body_ddl_OC_CardExpireY', creditCardInfo.expiryYear); // 到期年份
    await page.type('#CPH_Body_tb_OC_CardCVV', creditCardInfo.code); // 檢查碼
  } catch (err) {
    console.log(err);

    process.exit();
  }
};

(run)();

process.on('SIGINT', function() {
  console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );

  process.exit(0);
})

