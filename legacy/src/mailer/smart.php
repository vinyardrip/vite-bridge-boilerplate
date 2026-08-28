<?php
function getUserIP()
{
    $client = @$_SERVER['HTTP_CLIENT_IP'];
    $forward = @$_SERVER['HTTP_X_FORWARDED_FOR'];
    $remote = $_SERVER['REMOTE_ADDR'];

    if (filter_var($client, FILTER_VALIDATE_IP)) {
        $ip = $client;
    } elseif (filter_var($forward, FILTER_VALIDATE_IP)) {
        $ip = $forward;
    } else {
        $ip = $remote;
    }

    return $ip;
}

date_default_timezone_set('Europe/Minsk');
$date = date('H:i:s d/m/Y');
//$name = $_POST['name'];
$phone = $_POST['phone'];
//$email = $_POST['email'];
$url = $_POST['url'];
$loc_hero = $_POST['loc_hero'];
$loc_features = $_POST['loc_features'];
$loc_callme = $_POST['loc_callme'];
$loc_timeline = $_POST['loc_timeline'];
//$loc_popup = $_POST['loc_popup'];
//$loc_footer = $_POST['loc_footer'];
$days = array(1 => 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье');

$ip = getUserIP();

require_once('phpmailer/PHPMailerAutoload.php');
$mail = new PHPMailer;
$mail->CharSet = 'utf-8';

// $mail->SMTPDebug = 3;                               // Enable verbose debug output

$mail->isSMTP(); // Set mailer to use SMTP
$mail->Host = 'smtp.yandex.ru'; // Specify main and backup SMTP servers
//$mail->Host = 'smtp.mail.ru';  // Specify main and backup SMTP servers
//$mail->Host = 'smtp.gmail.com';  // Specify main and backup SMTP servers
$mail->SMTPAuth = true; // Enable SMTP authentication
$mail->Username = 'tehnadzor-minsk@yandex.by'; // Наш логин
$mail->Password = 'spjqqdcdpyazojen'; // Наш пароль от ящика
$mail->SMTPSecure = 'TLS'; // Enable TLS encryption, `ssl` also accepted
$mail->Port = 587; // TCP port to connect to

$mail->setFrom('tehnadzor-minsk@yandex.by', 'Дмитриев и партнеры'); // От кого письмо !!!!!!$mail->Username Должен совпадать с почтой от кого письмо
$mail->addAddress('web.chocoeye@gmail.com'); // Add a recipient
$mail->addAddress('tehnadzor.rb@gmail.com'); // Add a recipient
$mail->addAddress('info@tehnadzor-minsk.by'); // Add a recipient

//$mail->addAddress('Kirill1dmitriev@gmail.com');
//$mail->addAddress('vinyardrip@mail.ru');
//$mail->addAddress('ellen@example.com');               // Name is optional
//$mail->addReplyTo('info@example.com', 'Information');
//$mail->addCC('cc@example.com');
//$mail->addBCC('bcc@example.com');
//$mail->addAttachment('/var/tmp/file.tar.gz');         // Add attachments
//$mail->addAttachment('/tmp/image.jpg', 'new.jpg');    // Optional name
$mail->isHTML(true); // Set email format to HTML

$mail->Subject = 'Данные';
$mail->Body = '
    Пользователь оставил данные <br>

    Номер телефона: ' . $phone . ' <br>

    Форма: ' . $loc_hero . $loc_features . $loc_callme . $loc_timeline . ' <br>

    Дата: ' . $date . ' <br>

    День недели: ' . date($days[date('N')]) . ' <br>

    IP: ' . $ip . ' <br>

    Страница: ' . $url . '';


if (!$mail->send()) {
    return false;
} else {
    return true;
}