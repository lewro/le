# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from django.db import models
from django.contrib.auth.models import (
  AbstractBaseUser, BaseUserManager
)

from django_countries.fields import CountryField
from datetime import datetime

class UserManager(BaseUserManager):

  def create_user(self, email, password=None, is_active=True, is_staff=False, is_admin=False):
    if not email:
      raise ValueError("Users must have email address")
    if not password:
      raise ValueError("Users must have password")

    user = self.model(
      email = self.normalize_email(email)
    )

    user.set_password(password)

    user.staff   = is_staff
    user.admin   = is_admin
    user.active  = is_active

    user.save(using=self._db)
    return user

  def create_superuser(self, email, password=None):
    user = self.create_user(
      email,
      password=password,
      is_admin=True
    )
    return user

  def create_staff(self, email, password=None):
    user = self.create_user(
      email,
      password=password,
      is_staff=True
    )
    return user



#Custom User
class User(AbstractBaseUser):
  email            = models.EmailField(max_length=255, unique=True)
  active           = models.BooleanField(default=True)
  staff            = models.BooleanField(default=False)
  admin            = models.BooleanField(default=False)
  timestamp        = models.DateTimeField(auto_now_add=True)

  first_name       = models.CharField(max_length=255, blank=True, null=True)
  last_name        = models.CharField(max_length=255 , blank=True, null=True)
  username         = models.CharField(max_length=255 , blank=True, null=True)

  phone            = models.CharField(max_length=255, blank=True, null=True)
  mobile           = models.CharField(max_length=255, blank=True, null=True)
  web              = models.CharField(max_length=255, blank=True, null=True)

  street           = models.CharField(max_length=255, blank=True, null=True)
  street_number    = models.CharField(max_length=255, blank=True, null=True)
  city             = models.CharField(max_length=255, blank=True, null=True)
  country          = CountryField(default ='CZ')
  zipcode          = models.CharField(max_length=255, blank=True, null=True)
  district         = models.CharField(max_length=255, blank=True, null=True)
  district_id      = models.IntegerField(blank=True, null=True)

  latitude         = models.CharField(max_length=255, blank=True, null=True)
  longtitude       = models.CharField(max_length=255, blank=True, null=True)

  company          = models.CharField(max_length=255, blank=True, null=True)
  category_id      = models.IntegerField(blank=True, null=True)
  experience       = models.IntegerField(blank=True, null=True)

  hour_rate_from   = models.IntegerField(blank=True, null=True)
  hour_rate_to     = models.IntegerField(blank=True, null=True)

  bio              = models.TextField(max_length=5000, blank=True, null=True)
  expertise        = models.CharField(max_length=255 , blank=True, null=True)
  rating           = models.FloatField(max_length=255 , blank=True, null=True, default='5.0')

  profile_img      = models.ImageField(blank=True, default="default.jpg")


  USERNAME_FIELD = 'email'
  #Username and email are required by defaults

  objects = UserManager()

  def __str__(self):
    return self.email

  def get_full_name(self):
    return self.first_name + " " + self.last_name

  def get_full_address(self):
    return self.street + " " + self.street_number + " " + self.zipcode + " " + self.city + " " + self.country

  def get_short_name(self):
    return self.first_name

  def has_perm(self, perm, obj=None):
    return True

  def has_module_perms(self, app_label):
    return True

  def is_client(self):
    if self.category_id == None:
      return False
    else:
      return True

  @property
  def is_staff(self):
    return self.staff

  @property
  def is_superuser(self):
    return self.admin

  @property
  def is_active(self):
    return self.active

class Expertise(models.Model):
  title       = models.TextField()
  category_id = models.IntegerField(blank=True, null=True)

  def __str__(self):
    return self.title

class Message(models.Model):

  from_user        = models.ForeignKey(User, null=True, related_name='from_user')
  to_user          = models.ForeignKey(User, null=True, related_name='to_user')

  body             = models.TextField(max_length=5000, blank=True, null=True)
  status           = models.IntegerField(blank=True, null=True, default='1')
  replied_message  = models.IntegerField(blank=True, null=True)
  created_date     = models.DateTimeField(default=datetime.now)
  replied_date     = models.DateTimeField(auto_now=False, blank=True, null=True)

  def __str__(self):
    return self.body

class Rating(models.Model):

  from_user        = models.ForeignKey(User, null=True, related_name='rating_from_user')
  to_user          = models.ForeignKey(User, null=True, related_name='rating_to_user')

  body             = models.TextField(max_length=5000, blank=True, null=True)
  status           = models.IntegerField(blank=True, null=True, default='1')
  rating           = models.IntegerField(blank=True, null=True, default='5')
  created_date     = models.DateTimeField(default=datetime.now)

  def __str__(self):
    return self.body

class News(models.Model):

  title            = models.CharField(max_length=255, blank=True, null=True)
  source           = models.CharField(max_length=255, blank=True, null=True)
  link             = models.CharField(max_length=255, blank=True, null=True)
  body             = models.TextField(max_length=5000, blank=True, null=True)
  category_id      = models.IntegerField(blank=True, null=True, default='1')
  created_date     = models.DateTimeField(default=datetime.now)

  def __str__(self):
    return self.title
